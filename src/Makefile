TARGET = ../bin/passff.xpi

all: xpi

xpi:
	mkdir -p `dirname $(TARGET)`
	rm -f $(TARGET)
	zip -r $(TARGET) background.js manifest.json icon.png _locales content skin modules
