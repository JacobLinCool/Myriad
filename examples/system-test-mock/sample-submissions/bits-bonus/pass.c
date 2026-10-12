#include <stdio.h>

int count_bits(unsigned int n) {
    int count = 0;
    while (n != 0) {
        count += (int)(n & 1u);
        n >>= 1;
    }
    return count;
}
int highest_bit(unsigned int n) {
    int position = -1;
    while (n != 0) {
        position++;
        n >>= 1;
    }
    return position;
}
int main(void) {
    unsigned int n;
    if (scanf("%u", &n) != 1) return 0;
    printf("%d\n", count_bits(n));
    printf("%d\n", highest_bit(n));
    return 0;
}
