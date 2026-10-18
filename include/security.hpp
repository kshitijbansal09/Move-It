#pragma once

#include "common.hpp"

namespace sha {
string sha256Hex(const string& msg);
}
string makeSalt();
string hashPassword(const string& pw, const string& salt);
