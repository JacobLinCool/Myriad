#include <ctype.h>
#include <stdio.h>
#include <stdbool.h>

void read_word(int counts[26]) {
    int ch;
    while ((ch = getchar()) != EOF && isspace(ch)) {}
    while (ch != EOF && !isspace(ch)) {
        if (isalpha(ch)) counts[tolower(ch) - 'a']++;
        ch = getchar();
    }
}

bool equal_array(int counts1[26], int counts2[26]) {
    for (int i = 0; i < 26; i++)
        if (counts1[i] != counts2[i]) return false;
    return true;
}

int main(void) {
    int t;
    if (scanf("%d", &t) != 1) return 0;
    while (t-- > 0) {
        int first[26] = {0}, second[26] = {0};
        read_word(first);
        read_word(second);
        printf(equal_array(first, second) ? "The words are anagrams.\n" : "The words are not anagrams.\n");
    }
    return 0;
}
