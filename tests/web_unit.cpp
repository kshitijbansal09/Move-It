#include "web_common.hpp"
#include <iostream>
#include <functional>
using namespace web;
int main() {
    int checks=0;
    auto check=[&](bool value,const std::string& label){if(!value)throw std::runtime_error("Failed: "+label);checks++;};
    auto rejects=[&](const std::function<void()>& action,int status){try{action();return false;}catch(const Error& e){return e.status==status;}};
    Json slots=Json::array({Json{{"slot_id",1},{"label","1:00 PM"},{"departure_time","13:00:00"}},Json{{"slot_id",2},{"label","4:00 PM"},{"departure_time","16:00:00"}},Json{{"slot_id",3},{"label","6:00 PM"},{"departure_time","18:00:00"}}});
    check(assignSlot("2030-10-10T12:30",slots)["slot_id"]==1,"12:30 -> 1 PM");
    check(assignSlot("2030-10-10T17:10",slots)["slot_id"]==3,"17:10 -> 6 PM");
    auto tomorrow=assignSlot("2030-10-10T19:00",slots);
    check(tomorrow["trip_date"]=="2030-10-11" && tomorrow["next_day"]==true,"after-hours next-day mapping");
    check(assignSlot("2030-10-10T18:00:00",slots)["slot_id"]==3,"exact slot boundary");
    check(assignSlot("2030-10-10T18:00:01",slots)["next_day"]==true,"one second after last slot");
    check(assignSlot("2030-12-31T19:00",slots)["trip_date"]=="2031-01-01","year rollover");
    check(assignSlot("2028-02-28T19:00",slots)["trip_date"]=="2028-02-29","leap-day rollover");
    check(normalizeTime("2030-10-10T07:00:00Z")=="2030-10-10 12:30:00","UTC conversion");
    check(normalizeTime("2030-10-10T12:30:00+05:30")=="2030-10-10 12:30:00","campus offset conversion");
    check(rejects([&](){normalizeTime("2030-02-30T12:30");},400),"invalid date rejected");
    check(rejects([&](){normalizeTime("2030-02-30T12:30Z");},400),"invalid offset date rejected");
    check(rejects([&](){normalizeTime("2030-10-10T24:00");},400),"invalid hour rejected");
    check(rejects([&](){normalizeTime("12:30");},400),"missing date rejected");
    check(integer(Json{{"n",39.0}},"n")==39,"whole decimal SQL aggregate");
    check(rejects([&](){integer(Json{{"n",1.5}},"n");},400),"fractional integer rejected");
    auto hash=passwordHash("Password@123"),another=passwordHash("Password@123");
    check(hash!=another,"independent password salts");
    check(passwordMatches("Password@123",hash),"password verification");
    check(!passwordMatches("wrong",hash),"incorrect password rejected");
    check(!passwordMatches("password","malformed"),"malformed hash rejected");
    std::string secret="test-only-secret-with-at-least-32-characters";
    auto token=issueToken(Json{{"user_id",42}},secret);
    check(verifyToken(token,secret)==42,"JWT roundtrip");
    check(rejects([&](){verifyToken(token,"wrong-secret");},401),"JWT wrong signing key rejected");
    check(rejects([&](){verifyToken("invalid",secret);},401),"malformed JWT rejected");
    std::cout<<"Passed "<<checks<<" C++ web unit checks.\n";
}
