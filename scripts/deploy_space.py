"""Upload only the Helix server files to its Hugging Face Docker Space."""

import os
import shutil
import tempfile
from pathlib import Path

from huggingface_hub import HfApi


ROOT = Path(__file__).resolve().parents[1]
SPACE_ID = "smokemoney81/Helix"
SERVER_FILES = ("README.md", "Dockerfile", "requirements.txt", "app.py")


def main() -> None:
    token = os.environ.get("HF_DEPLOY_TOKEN")
    if not token:
        raise SystemExit("GitHub secret HF_DEPLOY_TOKEN fehlt.")

    api = HfApi(token=token)
    api.repo_info(repo_id=SPACE_ID, repo_type="space")

    with tempfile.TemporaryDirectory(prefix="helix-space-") as directory:
        stage = Path(directory)
        for name in SERVER_FILES:
            shutil.copy2(ROOT / name, stage / name)
        shutil.copytree(ROOT / "static", stage / "static")
        commit = api.upload_folder(
            folder_path=str(stage),
            repo_id=SPACE_ID,
            repo_type="space",
            commit_message=f"Deploy Helix from {os.environ.get('GITHUB_SHA', 'GitHub')[:12]}",
        )
        print(f"Helix deployed to {SPACE_ID}: {commit.commit_url}")


if __name__ == "__main__":
    main()
