import os
import subprocess
import imageio_ffmpeg

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

# Find raw webm video
webm_files = [f for f in os.listdir("demo_video_raw") if f.endswith(".webm")]
if not webm_files:
    raise RuntimeError("No raw webm file found in demo_video_raw!")

raw_video_path = os.path.join("demo_video_raw", webm_files[0])
audio_path = os.path.join("demo_audio", "master_narration.mp3")
output_mp4 = os.path.abspath("arcmemeperps_3min_demo.mp4")

print(f"Encoding final MP4 video from:\n- Video: {raw_video_path}\n- Audio: {audio_path}\n-> Output: {output_mp4}")

# FFmpeg command: merge video and audio, high quality H.264 + AAC
cmd = [
    ffmpeg_exe,
    "-y",
    "-i", raw_video_path,
    "-i", audio_path,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    output_mp4
]

res = subprocess.run(cmd, capture_output=True, text=True, errors="ignore")
if res.returncode != 0:
    print("FFmpeg error:", res.stderr)
    raise RuntimeError(f"FFmpeg failed with code {res.returncode}")

print("\nEncoding successfully completed!")
size_mb = os.path.getsize(output_mp4) / (1024 * 1024)
print(f"Output File: {output_mp4}")
print(f"File Size: {size_mb:.2f} MB")
