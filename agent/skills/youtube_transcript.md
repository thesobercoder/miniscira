---
description: Use when the user shares a YouTube link or asks what a specific video says.
---

# Read YouTube transcripts

Use `run_code`. The sandbox already has `yt-dlp`. Do not install packages during the chat.

Rules first:

- `run_code` runs Python. Write Python. `!yt-dlp ...` is a syntax error.
- If the caption fetch fails or produces no `.vtt`, tell the user the video has no readable transcript. Never fetch a transcript from the web or invent spoken content.

Steps:

1. Extract the 11-character video id from the URL (`v=`, `shorts/`, `embed/`, or the `youtu.be` path). Playlists have no transcript; reject them.
2. Run the caption fetch with `run_code`:

   ```python
   import subprocess

   cmd = [
       "yt-dlp",
       "--skip-download",
       "--write-subs",
       "--write-auto-subs",
       "--sub-langs", "en",
       "--sub-format", "vtt",
       "-o", "/workspace/yt.%(ext)s",
       "https://www.youtube.com/watch?v=VIDEO_ID",
   ]
   result = subprocess.run(cmd, capture_output=True, text=True)
   print(result.returncode)
   print(result.stderr[-2000:])
   ```

   For another language, pass it in `--sub-langs` (manual captions win over auto-generated for the same language).
3. Read `/workspace/yt.*.vtt` and use its spoken content.
4. Every answer that reports what the video says must include at least one `[mm:ss]` moment taken from a real cue timestamp in the `.vtt`.
5. No `.vtt` file, or a nonzero exit, means the video has no readable captions. Say so plainly. Do not fall back to web search for the transcript.
