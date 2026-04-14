from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PyPDF2 import PdfReader
from sentence_transformers import SentenceTransformer
from transformers import T5ForConditionalGeneration, T5Tokenizer
import faiss
import numpy as np
import time
import torch
import threading
import io

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models (same as your code, no change) ─────────────────────────
print("Loading embedding model...")
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

print("Loading T5 model...")
MODEL_NAME = "google/flan-t5-base"
tokenizer = T5Tokenizer.from_pretrained(MODEL_NAME)
t5_model = T5ForConditionalGeneration.from_pretrained(MODEL_NAME)
t5_model.eval()
print("Models ready ✅")

# ── Global state ─────────────────────────────────────────
chunks = []
faiss_index = None
is_processing = False   # 🔥 prevents double uploads


# ── Helpers ─────────────────────────────────────────

def load_pdf(file_bytes) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    return "".join(page.extract_text() or "" for page in reader.pages)


def chunk_text(text: str, chunk_size: int = 200, overlap: int = 50):
    words = text.split()
    result = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i: i + chunk_size])
        if chunk:
            result.append(chunk)
    return result


def process_pdf(file_bytes):
    global chunks, faiss_index, is_processing

    try:
        text = load_pdf(file_bytes)
        if not text.strip():
            return

        local_chunks = chunk_text(text)

        embeddings = embedding_model.encode(local_chunks, show_progress_bar=False)
        embeddings = np.array(embeddings, dtype="float32")

        index = faiss.IndexFlatL2(embeddings.shape[1])
        index.add(embeddings)

        # 🔥 atomic update (important)
        chunks = local_chunks
        faiss_index = index

    finally:
        is_processing = False  # always reset


def generate_answer(context: str, question: str) -> str:
    prompt = (
        "You are a helpful assistant. Answer the question using ONLY the context below. "
        "Structure your answer as clear bullet points starting with '•'. "
        "If the answer is not found in the context, reply exactly: Not found in document.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question}\n\n"
        "Answer (bullet points):"
    )

    inputs = tokenizer(prompt, return_tensors="pt", max_length=512, truncation=True)

    with torch.no_grad():
        output_ids = t5_model.generate(
            **inputs,
            max_new_tokens=200,
            num_beams=4,
            early_stopping=True,
            no_repeat_ngram_size=3,
        )

    raw = tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    if raw and not raw.startswith("•") and "Not found" not in raw:
        sentences = [s.strip() for s in raw.replace(". ", ".\n").split("\n") if s.strip()]
        raw = "\n".join(f"• {s}" for s in sentences)

    return raw


# ── Routes ─────────────────────────────────────────

@app.post("/upload/")
async def upload_pdf(file: UploadFile = File(...)):
    global is_processing

    if is_processing:
        raise HTTPException(status_code=429, detail="PDF is already being processed. Please wait.")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file.")

    is_processing = True

    # 🔥 run in background (non-blocking)
    threading.Thread(target=process_pdf, args=(file_bytes,)).start()

    return {"message": "PDF upload started. Processing in background."}


@app.get("/ask/")
def ask_question(query: str):
    global faiss_index, chunks, is_processing

    if is_processing:
        raise HTTPException(status_code=503, detail="PDF is still processing. Please wait.")

    if faiss_index is None or not chunks:
        raise HTTPException(status_code=400, detail="No PDF uploaded yet.")

    if not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    start = time.time()

    query_vec = embedding_model.encode([query], show_progress_bar=False)
    distances, indices = faiss_index.search(np.array(query_vec, dtype="float32"), k=3)

    retrieved = [chunks[i][:400] for i in indices[0] if i < len(chunks)]
    context = " ".join(retrieved)

    answer = generate_answer(context, query)

    elapsed_ms = round((time.time() - start) * 1000, 2)

    return {
        "answer": answer,
        "sources": retrieved,
        "stats": {
            "response_time_ms": elapsed_ms,
            "chunks_used": len(retrieved),
        },
        "graph": {
            "distances": distances[0].tolist(),
        },
    }


@app.get("/health/")
def health():
    return {
        "status": "ok",
        "chunks_loaded": len(chunks),
        "processing": is_processing
    }