FROM python:3.11-slim

WORKDIR /app

# Install dependencies directly since there are only a few
RUN pip install --no-cache-dir fastapi uvicorn pydantic jinja2

COPY main.py .
COPY templates/ templates/

EXPOSE 8001

# Run the app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
