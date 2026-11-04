using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

/// <summary>
/// Keeps troll names out: offensive words, hate symbols, extremists and polarising public figures, and staff impersonation.
/// NameAllowed() is for usernames, display names and group names; TextAllowed() (offensive words only) is for bios, descriptions and notes.
/// Matching survives leet-speak (h1tler), repeated letters (hiiitler), separators (h.i.t.l.e.r), camelCase and look-alike letters.
/// </summary>
public static class NameFilter
{
    // Offensive words are stored ROT13-encoded so this file doesn't spell them out.
    static string D(string s) => new string(s.Select(c => c is >= 'a' and <= 'z' ? (char)('a' + (c - 'a' + 13) % 26) : c).ToArray());
    /// <summary>Matched anywhere inside the letters of a name (long, distinctive words).</summary>
    static readonly string[] BadSub = new[] { "shpx", "avttre", "avttn", "snttbg", "juber", "ovgpu", "chffl", "nffubyr", "qvpxurnq", "fuvgurnq", "ohyyfuvg", "zbgureshpx", "jnaxre", "gjng", "genaal", "jrgonpx", "crqbcuvyr", "cnrqbcuvyr", "puvyqcbea", "xvqcbea", "cbea", "uragnv", "xvyylbhefrys", "wrexbss", "phzfyhg", "oybjwbo", "unaqwbo", "betnfz", "znfgheong", "ohxxnxr", "tnatonat", "afsj", "frkl", "frkhny", "cravf", "intvan", "obbof", "juvgrcbjre", "juvgrfhcerznpl", "urvyuvgyre", "fvrturvy", "guveqervpu", "ubybpnhfg", "trabpvqr", "tnfgurwrjf", "arbanmv" }.Select(D).ToArray();
    /// <summary>Matched only as a whole word, so innocent names (Essex, grape, Pakistan) are fine.</summary>
    static readonly HashSet<string> BadTok = new[] { "fuvg", "frk", "kkk", "phz", "nany", "gvgf", "obbo", "qvpx", "pbpx", "encr", "encrq", "encvat", "encvfg", "encvfgf", "crqb", "ergneq", "ergneqrq", "xvxr", "puvax", "fcvp", "pbba", "qlxr", "tbbx", "ornare", "cnxv", "xlf", "snt", "sntf", "anmv", "anmvf", "xxx", "vfvf", "phag", "phagf" }.Select(D).ToHashSet();

    /// <summary>Dictators, extremists and war criminals (matched anywhere in the name).</summary>
    static readonly string[] FigureSub = {
        "hitler", "adolfhitler", "stalin", "netanyahu", "mussolini", "polpot", "kimjongun", "kimjongil", "kimjongnam", "binladen", "saddamhussein",
        "khomeini", "khamenei", "himmler", "goebbels", "eichmann", "mengele", "ceausescu", "pinochet", "idiamin", "slobodanmilosevic", "radovankaradzic",
        "jeffreyepstein", "ghislainemaxwell", "charlesmanson", "jeffreydahmer", "tedbundy", "ratkomladic", "mullahomar", "alqaeda", "bokoharam", "basharassad", "maozedong", "maotsetung", "saddamhussein"
    };
    /// <summary>Polarising names and groups that are also ordinary words or short, so only matched as a whole word.</summary>
    static readonly HashSet<string> FigureTok = new() {
        "trump", "putin", "duterte", "bolsonaro", "mugabe", "gaddafi", "hamas", "hezbollah", "taliban", "lenin", "kony"
    };
    /// <summary>Words that make a name look like official staff.</summary>
    static readonly HashSet<string> ReservedTok = new() { "admin", "administrator", "moderator", "support", "staff", "official", "system", "thirdwheel", "owner" };

    static readonly Dictionary<char, char> Lookalikes = new()
    {
        ['а'] = 'a', ['е'] = 'e', ['о'] = 'o', ['р'] = 'p', ['с'] = 'c', ['х'] = 'x', ['у'] = 'y', ['і'] = 'i', ['ѕ'] = 's', ['к'] = 'k', ['м'] = 'm', ['н'] = 'h', ['т'] = 't', ['в'] = 'b',
        ['α'] = 'a', ['ο'] = 'o', ['ε'] = 'e', ['ι'] = 'i', ['κ'] = 'k', ['ν'] = 'v', ['ρ'] = 'p', ['τ'] = 't', ['υ'] = 'u', ['χ'] = 'x'
    };

    /// <summary>Lower-case letters only: accents removed, look-alikes and leet-speak mapped (the digit 1 can read as i or l, so both are tried).</summary>
    static string Letters(string s, char one)
    {
        var sb = new StringBuilder();
        foreach (var ch0 in s.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch0) == UnicodeCategory.NonSpacingMark) continue;
            var c = char.ToLowerInvariant(ch0);
            if (Lookalikes.TryGetValue(c, out var l)) c = l;
            c = c switch { '0' => 'o', '1' => one, '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '8' => 'b', '@' => 'a', '$' => 's', '!' => one, '|' => one, _ => c };
            if (c is >= 'a' and <= 'z') sb.Append(c);
        }
        return sb.ToString();
    }
    /// <summary>Runs of the same letter shrink to one (hiiitler -> hitler).</summary>
    static string Collapse(string s)
    {
        var sb = new StringBuilder();
        foreach (var c in s) if (sb.Length == 0 || sb[^1] != c) sb.Append(c);
        return sb.ToString();
    }
    /// <summary>Runs of 3+ identical letters shrink to 2 (niggger -> nigger) without turning real words into other words.</summary>
    static string Squeeze(string s)
    {
        var sb = new StringBuilder(); int run = 0;
        foreach (var c in s)
        {
            if (sb.Length > 0 && sb[^1] == c) { run++; if (run >= 2) continue; } else run = 0;
            sb.Append(c);
        }
        return sb.ToString();
    }
    /// <summary>Whole words: split on separators, camelCase and letter/digit boundaries.</summary>
    static IEnumerable<string> Words(string s) =>
        Regex.Split(s, @"[^\p{L}\p{N}]+|(?<=\p{Ll})(?=\p{Lu})|(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})").Where(w => w.Length > 0);

    static bool Hits(string text, bool names)
    {
        foreach (var one in new[] { 'i', 'l' })
        {
            var letters = Letters(text, one);
            var collapsed = Collapse(letters);
            var squeezed = Squeeze(letters);
            foreach (var bad in BadSub) if (letters.Contains(bad) || squeezed.Contains(bad)) return true;
            if (names)
            {
                foreach (var f in FigureSub) if (letters.Contains(f) || collapsed.Contains(Collapse(f))) return true;
                if (letters.Contains("thirdwheel")) return true;
            }
        }
        foreach (var w in Words(text))
        {
            var lw = w.ToLowerInvariant();
            foreach (var one in new[] { 'i', 'l' })
            {
                var n = Letters(w, one);
                if (n.Length == 0) continue;
                if (BadTok.Contains(n) || BadTok.Contains(lw)) return true;
                if (names && (FigureTok.Contains(n) || FigureTok.Contains(lw) || ReservedTok.Contains(n))) return true;
            }
        }
        if (names && (text.Contains("1488") || text.Contains("14/88"))) return true;   // neo-nazi numbers
        return false;
    }

    /// <summary>True when a username, display name or group name is fine to use. Admins are never blocked.</summary>
    public static bool NameAllowed(string? name, bool isAdmin = false) => isAdmin || string.IsNullOrWhiteSpace(name) || !Hits(name, names: true);
    /// <summary>True when free text (bio, description, notes) has no offensive words. Names of public figures are fine here.</summary>
    public static bool TextAllowed(string? text) => string.IsNullOrWhiteSpace(text) || !Hits(text, names: false);

    public const string NameMessage = "That name isn't allowed. Please choose another.";
    public const string TextMessage = "Please keep it friendly. That text contains words that aren't allowed.";
}