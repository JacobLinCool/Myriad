#include <stdio.h>

static long long pref[100005];

int main(void) {
    int n, q;
    if (scanf("%d %d", &n, &q) != 2) return 0;
    pref[0] = 0;
    for (int i = 1; i <= n; i++) {
        long long val;
        scanf("%lld", &val);
        pref[i] = pref[i - 1] + val;
    }
    for (int j = 0; j < q; j++) {
        int l, r;
        scanf("%d %d", &l, &r);
        printf("%lld\n", pref[r] - pref[l - 1]);
    }
    return 0;
}
