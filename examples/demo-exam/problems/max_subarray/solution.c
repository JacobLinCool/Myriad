#include <stdio.h>

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    long long max_so_far = -1000000000000000000LL;
    long long curr_max = -1000000000000000000LL;
    for (int i = 0; i < n; i++) {
        long long val;
        scanf("%lld", &val);
        if (i == 0) {
            curr_max = val;
            max_so_far = val;
        } else {
            curr_max = (val > curr_max + val) ? val : (curr_max + val);
            if (curr_max > max_so_far) {
                max_so_far = curr_max;
            }
        }
    }
    printf("%lld\n", max_so_far);
    return 0;
}
