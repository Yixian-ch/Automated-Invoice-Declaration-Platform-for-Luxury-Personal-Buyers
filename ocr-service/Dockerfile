FROM python:3.11-slim

# System deps for pdf2image (poppler) and PaddleOCR (libgomp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -Ls https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

COPY requirements.txt .

# Create venv with uv and install deps
RUN uv venv .venv
RUN uv pip install --python .venv/bin/python --no-cache setuptools
# Pin numpy<2.0 first; PaddlePaddle 2.6.x is compiled against the 1.x ABI
RUN uv pip install --python .venv/bin/python --no-cache "numpy>=1.20.0,<2.0"
RUN uv pip install --python .venv/bin/python --no-cache -r requirements.txt

COPY main.py .

EXPOSE 8000

CMD [".venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
