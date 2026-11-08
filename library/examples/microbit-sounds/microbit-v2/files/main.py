from microbit import *
import audio
import music

# The micro:bit V2's speaker: its own sounds, a sound effect of your own, and music
display.show(Image.HAPPY)
audio.play(Sound.HELLO)                  # a built-in sound

laser = audio.SoundEffect(freq_start=1800, freq_end=200, duration=300,
                          shape=audio.SoundEffect.SHAPE_LINEAR)

while True:
    if button_a.was_pressed():
        display.show(Image.HAPPY)
        audio.play(Sound.GIGGLE)
    elif button_b.was_pressed():
        display.show(Image.ARROW_E)
        audio.play(laser)                # high to low in 0.3 s
    elif accelerometer.was_gesture('shake'):
        display.show(Image.MUSIC_QUAVER)
        music.play(music.BA_DING, pin=None)   # the speaker alone: pin 0 stays free
    sleep(20)
