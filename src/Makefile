
VERSION := testing

SRC_DIR := .
TARGET_DIR := ../bin/$(VERSION)
BUILD_DIR := ../build/$(VERSION)

CONTENT_FILES := content _locales modules skin icon.png
CONTENT_SRC := $(addprefix $(SRC_DIR)/,$(CONTENT_FILES))
CONTENT_OUT := $(addprefix $(BUILD_DIR)/,$(CONTENT_FILES))

MANIFEST_FILE := manifest.json
MANIFEST_SRC := $(SRC_DIR)/$(MANIFEST_FILE)
MANIFEST_OUT := $(BUILD_DIR)/$(MANIFEST_FILE)

XPI_CONTENTS := $(CONTENT_OUT) $(MANIFEST_OUT)
XPI_TARGET := $(TARGET_DIR)/passff.xpi

all: $(XPI_TARGET)

%/.d:
	mkdir -p $(@D)
	@touch $@

$(MANIFEST_OUT): $(MANIFEST_SRC) $(BUILD_DIR)/.d
	cp $(MANIFEST_SRC) $@
	sed -i "s/_VERSIONHOLDER_/$(VERSION)/g" $@

$(CONTENT_OUT): $(BUILD_DIR)/%: $(SRC_DIR)/% $(BUILD_DIR)/.d
	cp -r $(SRC_DIR)/$* $@

$(XPI_TARGET): $(XPI_CONTENTS) $(TARGET_DIR)/.d
	rm -f $@
	cd $(BUILD_DIR); zip __.zip -q -r ./* -x \*/.d
	mv $(BUILD_DIR)/__.zip $@

clean:
	rm -rf $(TARGET_DIR)
	rm -rf $(BUILD_DIR)

.PRECIOUS: %/.d

