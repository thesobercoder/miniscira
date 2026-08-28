---
description: Use when the user shares a YouTube link or asks what a specific video says.
---

# Read YouTube transcripts

Use `run_code`. The sandbox already has `yt-dlp`. Do not install packages during the chat.

1. Extract the 11-character video id from the URL (`v=`, `shorts/`, `embed/`, or the `youtu.be` path). Playlists have no transcript; reject them.
2. Fetch the caption track with `run_code`:

   ```
   yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs en --sub-format vtt -o '/workspace/yt.%(ext)s' 'https://www.youtube.com/watch?v=VIDEO_ID'
   ```

   For another language, pass it in `--sub-langs` (manual captions win over auto-generated for the same language).
3. Read `/workspace/yt.*.vtt` and use its spoken content.
4. Every answer that reports what the video says must include at least one `[mm:ss]` moment taken from a real cue timestamp in the `.vtt`.
5. No `.vtt` file means the video has no captions. Say so plainly. Never invent spoken content.
