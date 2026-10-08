#include <stdio.h>

int main(void) {
    int m, d, y;
    int best_m = 0, best_d = 0, best_y = -1;
    while (scanf("%d/%d/%d", &m, &d, &y) == 3) {
        if (m == 0 && d == 0 && y == 0) break;
        if (m < 1 || m > 12) {
            printf("Invalid month! Please enter again.\n");
            continue;
        }
        if (y > best_y || (y == best_y && (m > best_m || (m == best_m && d > best_d)))) {
            best_m = m;
            best_d = d;
            best_y = y;
        }
    }
    printf("%d/%d/%02d is the latest date\n", best_m, best_d, best_y);
    return 0;
}
