#include <stdio.h>

int count_bits(unsigned int n) {
    int count = 0;
    while (n != 0) {
        count += (int)(n % 2u);
        n /= 2;
    }
    return count;
}
int main(void) {
    unsigned int n;
    if (scanf("%u", &n) != 1) return 0;
    printf("%d\n", count_bits(n));
    return 0;
}
