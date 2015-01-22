TARGET = ../bin/passff.xpi

all: xpi

xpi:
	mkdir -p `dirname $(TARGET)`
	rm -f $(TARGET)
	zip -r $(TARGET) bootstrap.js install.rdf chrome.manifest icon.png chrome modules
