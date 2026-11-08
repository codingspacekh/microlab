from mfrc522 import MFRC522
import time

# SCK D18, MOSI D23, MISO D19; its SDA (chip select) on D5, RST on D22; 3.3 V only
reader = MFRC522(sck=18, mosi=23, miso=19, cs=5, rst=22)
print('Hold a card to the reader')
while True:
    reader.init()
    stat, _ = reader.request(reader.REQIDL)    # a tag in the field?
    if stat == reader.OK:
        stat, uid = reader.SelectTagSN()       # its UID
        if stat == reader.OK:
            print('Card', reader.tohexstring(uid))
    time.sleep(0.5)
