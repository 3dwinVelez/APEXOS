FROM python:3.12-slim
WORKDIR /app
RUN groupadd -r apex && useradd -r -g apex -m -d /home/apex apex && chown -R apex:apex /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && chown -R apex:apex /app
COPY . .
USER apex
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

