// The console entry point is preserved; MOVEIT_WEB selects the C++/MySQL web app.
#include "application.hpp"
#include "self_tests.hpp"

#ifdef MOVEIT_WEB
#include "web_service.hpp"
int main(int argc, char** argv) {
    return web::runWeb(argc, argv);
}
#else
int main(int argc, char** argv) {
    if (argc > 1 && string(argv[1]) == "--test") return runTests();
    App().run();
    return 0;
}
#endif
