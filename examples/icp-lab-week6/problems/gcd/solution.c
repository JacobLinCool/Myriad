#include <stdio.h>

int gcd(int a, int b) {
    if (a < 0) a = -a;
    if (b < 0) b = -b;
    while (b != 0) {
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}

int main(void) {
    int t, a, b;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0 && scanf("%d %d", &a, &b) == 2)
        printf("GCD: %d\n", gcd(a, b));
    return 0;
}
