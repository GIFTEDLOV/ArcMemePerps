import os
import subprocess
import imageio_ffmpeg

ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
files = [
    'demo_audio/scene1_landing.mp3',
    'demo_audio/scene2_tour.mp3',
    'demo_audio/scene3_markets.mp3',
    'demo_audio/scene4_chart.mp3',
    'demo_audio/scene5_trade.mp3',
    'demo_audio/scene6_positions.mp3',
    'demo_audio/scene7_profile.mp3'
]

list_path = 'demo_audio/concat_list.txt'
with open(list_path, 'w', encoding='utf-8') as f:
    for audio in files:
        abs_p = os.path.abspath(audio).replace('\\', '/')
        f.write(f"file '{abs_p}'\n")

out_path = 'demo_audio/master_narration.mp3'
subprocess.run([ffmpeg_exe, '-y', '-f', 'concat', '-safe', '0', '-i', list_path, '-c', 'copy', out_path], check=True)
print('Master audio created successfully at:', out_path)
