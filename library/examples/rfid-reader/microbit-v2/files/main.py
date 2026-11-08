from microbit import *
from mfrc522 import MFRC522

# SCK P13, MOSI P15, MISO P14; its SDA (chip select) on P16, RST on P8; 3.3 V only
reader = MFRC522(sck=pin13, mosi=pin15, miso=pin14, cs=pin16, rst=pin8)
print('Hold a card to the reader')
while True:
    reader.init()
    stat, _ = reader.request(reader.REQIDL)    # a tag in the field?
    if stat == reader.OK:
        stat, uid = reader.SelectTagSN()       # its UID
        if stat == reader.OK:
            print('Card', reader.tohexstring(uid))
    sleep(500)
