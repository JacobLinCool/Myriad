#include <stdio.h>

int sum_digits(unsigned int n) {
    if (n < 10) return (int)n;
    return (int)(n % 10) + sum_digits(n / 10);
}
int reduce_digits(unsigned int n) {
    if (n < 10) return (int)n;
    return reduce_digits((unsigned int)sum_digits(n));
}
int main(void) {
    unsigned int n;
    if (scanf("%u", &n) != 1) return 0;
    printf("%d\n", sum_digits(n));
    printf("%d\n", reduce_digits(n));
    return 0;
}
