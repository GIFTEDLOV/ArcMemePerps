import os
import shutil
import subprocess
import imageio_ffmpeg

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

raw_dir = "scripts/demo/demo_video_raw"
webm_files = [f for f in os.listdir(raw_dir) if f.endswith(".webm")]
if not webm_files:
    raise RuntimeError(f"No raw webm file found in {raw_dir}!")

# Use the largest or newest webm file if multiple
webm_files.sort(key=lambda x: os.path.getsize(os.path.join(raw_dir, x)), reverse=True)
raw_video_path = os.path.join(raw_dir, webm_files[0])
audio_path = os.path.join("scripts/demo/demo_audio", "master_narration.mp3")
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

size_mb = os.path.getsize(output_mp4) / (1024 * 1024)
print(f"\nFinal Video Created Successfully!")
print(f"Output File: {output_mp4}")
print(f"File Size: {size_mb:.2f} MB")

# Copy to artifacts directory and infra repo
artifact_dir = r"C:\Users\DELL\.gemini\antigravity\brain\75966656-aa47-446b-98b6-6357ca8e94a7"
infra_dest = r"C:\Users\DELL\ArcMemePerps-infra\arcmemeperps_3min_demo.mp4"

try:
    artifact_dest = os.path.join(artifact_dir, "arcmemeperps_3min_demo.mp4")
    shutil.copyfile(output_mp4, artifact_dest)
    print(f"Copied to artifacts: {artifact_dest}")
except Exception as e:
    print(f"Artifact copy error: {e}")

try:
    shutil.copyfile(output_mp4, infra_dest)
    print(f"Copied to infra: {infra_dest}")
except Exception as e:
    print(f"Infra copy error: {e}")
