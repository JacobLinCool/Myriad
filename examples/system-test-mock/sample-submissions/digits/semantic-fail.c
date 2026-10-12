#include <stdio.h>

int sum_digits(unsigned int n) {
    int total = 0;
    while(n) { total += n % 10; n /= 10; }
    return total;
}
int main(void) {
    unsigned int n;
    if (scanf("%u", &n) != 1) return 0;
    printf("%d\n", sum_digits(n));
    return 0;
}
