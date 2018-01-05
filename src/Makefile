
VERSION := 1.0testing

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

HOST_SRC_DIR := $(SRC_DIR)/host
HOST_TARGET_DIR := $(TARGET_DIR)

INSTALL_WIN_FILE := install_host_app.bat
INSTALL_WIN_SRC := $(HOST_SRC_DIR)/$(INSTALL_WIN_FILE)
INSTALL_WIN_TARGET := $(HOST_TARGET_DIR)/$(INSTALL_WIN_FILE)

INSTALL_UNIX_FILE := install_host_app.sh
INSTALL_UNIX_SRC := $(HOST_SRC_DIR)/$(INSTALL_UNIX_FILE)
INSTALL_UNIX_TARGET := $(HOST_TARGET_DIR)/$(INSTALL_UNIX_FILE)

HOST_APP_FILES := passff.py passff.json
HOST_APP_SRC := $(addprefix $(HOST_SRC_DIR)/,$(HOST_APP_FILES))
HOST_APP_TARGET := $(addprefix $(HOST_TARGET_DIR)/,$(HOST_APP_FILES))

HOST_TARGETS := $(INSTALL_WIN_TARGET) $(INSTALL_UNIX_TARGET) $(HOST_APP_TARGET)

all: $(XPI_TARGET) $(HOST_TARGETS)

%/.d:
	mkdir -p $(@D)
	@touch $@

$(HOST_TARGETS): $(HOST_TARGET_DIR)/%: $(HOST_SRC_DIR)/% $(HOST_TARGET_DIR)/.d
	cp $(HOST_SRC_DIR)/$* $@
	sed -i "s/1.0testing/$(VERSION)/g" $@

$(MANIFEST_OUT): $(MANIFEST_SRC) $(BUILD_DIR)/.d
	cp $(MANIFEST_SRC) $@
	sed -i "s/1.0testing/$(VERSION)/g" $@

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

