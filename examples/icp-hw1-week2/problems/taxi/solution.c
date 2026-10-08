#include <stdio.h>

int main(void) {
    int t, base_fare, cost_per_km, distance, passengers;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0 && scanf("%d %d %d %d", &base_fare, &cost_per_km, &distance, &passengers) == 4) {
        int total = base_fare + cost_per_km * distance;
        double per_person = (double)total / passengers;
        printf("Total Fare = NT$%d, Each Passenger Pays = NT$%.2f\n", total, per_person);
    }
    return 0;
}
