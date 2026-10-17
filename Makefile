CXX ?= c++
CPPFLAGS += -Iinclude
CXXFLAGS ?= -O2 -Wall -Wextra -pedantic
CXXFLAGS += -std=c++17

TARGET := build/moveit
SOURCES := moveit.cpp $(wildcard src/*.cpp)
OBJECTS := $(patsubst %.cpp,build/%.o,$(SOURCES))
DEPS := $(OBJECTS:.o=.d)

.PHONY: all run test verify
all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CXX) $(CXXFLAGS) $(OBJECTS) $(LDFLAGS) $(LDLIBS) -o $@

build/%.o: %.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -MMD -MP -c $< -o $@

run: $(TARGET)
	./$(TARGET)

test: $(TARGET)
	./$(TARGET) --test

verify: $(TARGET)
	python3 tests/verify_equivalence.py

-include $(DEPS)

# The original dependency-free console build above remains available.
MYSQL_CONFIG ?= mysql_config
MYSQL_INCLUDE := $(shell $(MYSQL_CONFIG) --include 2>/dev/null)
MYSQL_LIBDIR := $(shell $(MYSQL_CONFIG) --variable=pkglibdir 2>/dev/null)
OPENSSL_PREFIX ?= $(firstword $(wildcard /opt/homebrew/opt/openssl@4 /opt/homebrew/opt/openssl@3 /usr/local/opt/openssl@3))
WEB_CPPFLAGS := -DMOVEIT_WEB -Iinclude -Iweb/include -Iweb/vendor $(MYSQL_INCLUDE) $(if $(OPENSSL_PREFIX),-I$(OPENSSL_PREFIX)/include)
WEB_LDLIBS := $(if $(MYSQL_LIBDIR),-L$(MYSQL_LIBDIR)) -lmysqlclient $(if $(OPENSSL_PREFIX),-L$(OPENSSL_PREFIX)/lib) -lcrypto -pthread
WEB_SOURCES := moveit.cpp $(wildcard src/*.cpp) $(wildcard web/src/*.cpp)
WEB_OBJECTS := $(patsubst %.cpp,build/web/%.o,$(WEB_SOURCES))

.PHONY: web serve init-sql seed-sql frontend test-web
web: build/moveit-web

build/moveit-web: $(WEB_OBJECTS)
	$(CXX) $(CXXFLAGS) $(WEB_OBJECTS) $(LDFLAGS) $(WEB_LDLIBS) -o $@

build/web/%.o: %.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(WEB_CPPFLAGS) $(CXXFLAGS) -MMD -MP -c $< -o $@

serve: web
	./build/moveit-web --serve

init-sql: web
	./build/moveit-web --init-db

seed-sql: web
	./build/moveit-web --seed-schedule

frontend:
	cd frontend && npm run build

test-web: web
	python3 tests/test_web.py

-include $(WEB_OBJECTS:.o=.d)

.PHONY: test-web-unit
build/test-web-unit: tests/web_unit.cpp web/src/web_common.cpp web/include/web_common.hpp
	$(CXX) $(WEB_CPPFLAGS) $(CXXFLAGS) tests/web_unit.cpp web/src/web_common.cpp $(if $(OPENSSL_PREFIX),-L$(OPENSSL_PREFIX)/lib) -lcrypto -o $@

test-web-unit: build/test-web-unit
	./build/test-web-unit
