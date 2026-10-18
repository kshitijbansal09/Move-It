#include "console.hpp"

bool gEof = false;
string readLine(const string& prompt) {
    std::cout << prompt << std::flush;
    string s;
    if (!std::getline(std::cin, s)) { gEof = true; return ""; }
    return trim(s);
}
bool parseInt(const string& s, int& out) {
    try { size_t p; out = std::stoi(s, &p); return p == s.size(); } catch (...) { return false; }
}
int readInt(const string& prompt, int fallback) {
    int v; return parseInt(readLine(prompt), v) ? v : fallback;
}
double readDouble(const string& prompt, double fallback) {
    try { return std::stod(readLine(prompt)); } catch (...) { return fallback; }
}
void rule() { std::cout << string(78, '-') << "\n"; }
