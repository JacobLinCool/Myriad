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

void reduce(int numerator, int denominator, int *reduced_numerator, int *reduced_denominator) {
    int g = gcd(numerator, denominator);
    *reduced_numerator = numerator / g;
    *reduced_denominator = denominator / g;
    if (*reduced_denominator < 0) {
        *reduced_numerator = -*reduced_numerator;
        *reduced_denominator = -*reduced_denominator;
    }
}

int main(void) {
    int t, n, d, rn, rd;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0 && scanf("%d/%d", &n, &d) == 2) {
        if (d == 0) {
            printf("Denominator cannot be zero.\n");
            continue;
        }
        reduce(n, d, &rn, &rd);
        printf("In lowest terms: %d/%d\n", rn, rd);
        printf("The value is: %g\n", (double)rn / rd);
    }
    return 0;
}
