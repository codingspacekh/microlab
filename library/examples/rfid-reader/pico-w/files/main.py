from mfrc522 import MFRC522
import time

# SPI0: SCK GP18, MOSI GP19, MISO GP16; its SDA (chip select) on GP17, RST on GP20; 3.3 V only
reader = MFRC522(spi_id=0, sck=18, mosi=19, miso=16, cs=17, rst=20)
print('Hold a card to the reader')
while True:
    reader.init()
    stat, _ = reader.request(reader.REQIDL)    # a tag in the field?
    if stat == reader.OK:
        stat, uid = reader.SelectTagSN()       # its UID
        if stat == reader.OK:
            print('Card', reader.tohexstring(uid))
    time.sleep(0.5)
