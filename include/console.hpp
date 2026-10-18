#pragma once

#include "utils.hpp"

extern bool gEof;
string readLine(const string& prompt);
bool parseInt(const string& s, int& out);
int readInt(const string& prompt, int fallback = -1);
double readDouble(const string& prompt, double fallback = 0);
void rule();
