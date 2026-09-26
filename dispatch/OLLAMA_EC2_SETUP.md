# Connect SENTRI Dispatch to Ollama on EC2

These steps keep Dispatch on your Mac and run only Ollama/Qwen on the EC2 GPU.

## 1. Launch EC2

In **AWS Console -> EC2 -> Launch instance**, choose:

```text
Region: Asia Pacific (Jakarta)
AMI: Ubuntu Server 24.04 LTS, 64-bit x86
Instance type: g5.xlarge
Storage: 50 GiB gp3
Public IPv4: Enabled
```

Create a security group with SSH port `22` from **My IP** only. Do not open
Ollama port `11434` publicly.

## 2. Connect to EC2

On your Mac, replace the key path and public IP:

```bash
chmod 400 ~/Downloads/sentri-ollama.pem
ssh -i ~/Downloads/sentri-ollama.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

## 3. Install the NVIDIA driver

Run inside the EC2 terminal:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ubuntu-drivers-common
sudo ubuntu-drivers install
sudo reboot
```

Reconnect after the reboot and verify the GPU:

```bash
ssh -i ~/Downloads/sentri-ollama.pem ubuntu@YOUR_EC2_PUBLIC_IP
nvidia-smi
```

## 4. Install Ollama and Qwen

Run inside EC2:

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
ollama pull huihui_ai/qwen3-abliterated:latest
ollama list
```

Ollama and Qwen are now installed on EC2. They do not need to be installed
again on another developer's Mac.

## 5. Create the SSH tunnel

Open a new Mac terminal and run:

```bash
ssh -i ~/Downloads/sentri-ollama.pem \
  -N \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=60 \
  -L 11435:127.0.0.1:11434 \
  ubuntu@YOUR_EC2_PUBLIC_IP
```

Leave this terminal open. It forwards:

```text
Mac 127.0.0.1:11435 -> EC2 127.0.0.1:11434 -> Ollama -> Qwen GPU
```

## 6. Test the AI connection

Open another Mac terminal:

```bash
curl --max-time 30 http://127.0.0.1:11435/api/tags
```

The response should include `huihui_ai/qwen3-abliterated:latest`.

Test a small response:

```bash
curl --max-time 60 http://127.0.0.1:11435/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "huihui_ai/qwen3-abliterated:latest",
    "messages": [{"role": "user", "content": "Reply with OK."}],
    "stream": false,
    "options": {"num_predict": 10}
  }'
```

## 7. Connect Dispatch to the AI

From the project:

```bash
cd /Users/elkahfi/Desktop/Sentricol/SENTRI/dispatch
```

Add these values to `dispatch/.env.local`:

```env
OLLAMA_HOST=http://127.0.0.1:11435
SENTRI_MODEL=huihui_ai/qwen3-abliterated:latest
```

Restart Dispatch:

```bash
pnpm dev
```

Open the local URL shown by Next.js, usually `http://localhost:3000`.

Keep these running while using the chatbot:

```text
Terminal 1: SSH tunnel
Terminal 2: pnpm dev
```

Closing the SSH tunnel disconnects Dispatch from the AI.
