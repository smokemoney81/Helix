"""Launch Helix on a Hugging Face Gradio Space with its existing FastAPI UI."""

import gradio as gr
import uvicorn
from fastapi import FastAPI

from app import app as studio


with gr.Blocks() as welcome:
    gr.Markdown("# Helix Studio\n\n[Studio öffnen](/)")


app = gr.mount_gradio_app(FastAPI(), welcome, path="/gradio")
app.mount("/", studio)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860, workers=1)
