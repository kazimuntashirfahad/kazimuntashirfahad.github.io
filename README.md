# Portfolio + Admin Panel (GitHub Pages version)

Ei version-e apnar website-er sob lekha, chobi, blog, publication, project ekta **admin panel** theke change kora jabe. Code dhorte hobe na. Admin panel apnar GitHub repository-te change save kore, ar GitHub 1–2 minute-er moddhe website update kore dey.

---

## Dhap 1: Purono file shoriye notun file upload korun

1. GitHub-e apnar repository kholun: `github.com/kazimuntashirfahad834/kazimuntashirfahad834.github.io`
2. Purono file delete korte hobe na. Notun file same nam-e upload korle purono gulo replace hoye jabe.
3. Ei zip file (`portfolio-gh-admin.zip`) computer-e **Extract** korun.
4. Repository page-e **Add file → Upload files** chapun.
5. Extract kora folder-er **bhitorer sob kichu** (folder na, bhitorer file ar folder gulo) select kore drag & drop korun:
   `admin`, `assets`, `data`, `uploads`, `index.html`, `research.html`, `publications.html`, `projects.html`, `blog.html`, `post.html`, `about.html`, `contact.html`, `404.html`, `.nojekyll`, `README.md`
   - `.nojekyll` file-ta hidden thakte pare. Mac-e Finder-e **Cmd + Shift + .** chapun, Windows-e **View → Hidden items** tik din.
6. Niche **Commit changes** chapun.
7. 1–2 minute por `https://kazimuntashirfahad834.github.io` kholun. Site age jemon chilo temoni dekhabe.
8. (Optional) Purono `blog` folder-ta ar lagbe na, karon ekhon blog post `post.html` theke ashe. Chaile folder-er file gulo delete korte paren.

---

## Dhap 2: Admin panel-er jonno ekta "token" banan (ekbar-i korte hobe)

Token holo ekta password, ja diye admin panel apnar repository-te save korte pare.

1. GitHub-e login thaka obosthay ei link kholun: **https://github.com/settings/personal-access-tokens/new**
2. **Token name:** `Portfolio admin`
3. **Expiration:** `Custom` → 1 bochor porer date din (tarpor notun token banate hobe).
4. **Repository access:** **Only select repositories** → dropdown theke `kazimuntashirfahad834.github.io` select korun.
5. **Permissions → Repository permissions** khulun → **Contents** khuje ber kore **Read and write** din.
   (Metadata nije theke "Read-only" hoye jabe, oita thik ache.)
6. Niche **Generate token** chapun, abar confirm korun.
7. Je token-ta dekhabe (`github_pat_...` diye shuru) seta **copy** kore kothao nirapode rakhun. Ei page bondho korle ar dekhabe na.

> Token karo sathe share korben na. Keu token pele apnar website change korte parbe. Haray gele GitHub-e oi token **Delete** kore notun banan.

---

## Dhap 3: Admin panel kholun

1. Browser-e jan: **https://kazimuntashirfahad834.github.io/admin/**
2. **Access token** box-e token paste korun. Username ar repository nije theke bhore jabe.
3. **Connect** chapun. Dashboard khulbe.
4. "Remember me" tik thakle porer bar token lagbe na. Onner computer-e hole tik tule din, ar kaj shesh hole **Log out** chapun.

---

## Admin panel diye ki ki korte parben

| Bam dike menu | Ki change hoy |
|---|---|
| **Site settings → Profile & photos** | Nam, profile chobi, CV (PDF), email, location, GitHub/LinkedIn/X/Scholar link |
| **Site settings → Homepage** | Boro title, intro lekha, research interests, Google description |
| **Site settings → Page intros & numbers** | Research/Publications/Projects/Blog page-er intro ar number gulo |
| **Site settings → About page** | Biography, heading, photo badge, numbers |
| **Site settings → Contact & email** | Contact page lekha, form topics, Formspree ID, page-er nicher "Let's work together" section |
| **Media** | Chobi/PDF upload, address copy, delete |
| **Blog posts** | Notun post, edit, delete, draft rakha, cover chobi |
| **Publications** | Paper add/edit, PDF upload, homepage-e dekhano |
| **Projects** | Project add/edit, logo, homepage/spotlight |
| **Research areas** | Research focus card gulo |
| **Current research, Collaborations** | Research page-er list |
| **Education, Experience, Skills, Awards, Talks** | About page-er list |
| **FAQ** | Contact page-er proshno-uttor |

- List-e **↑ ↓** button diye order bodlan (site-e oi order-e dekhabe).
- Prottek **Save** er por **1–2 minute** opekkha korun, tarpor site **Ctrl + Shift + R** (Mac: Cmd + Shift + R) diye refresh korun.
- Kotodur holo dekhte chaile: repository-r **Actions** tab-e "pages build and deployment" sobuj tik holei live.

### Blog post-e chobi dite
1. **Media** → chobi upload korun.
2. Chobir nicher address-e click korle copy hobe (jemon `uploads/2026/photo-ab12cd.jpg`).
3. Post-er **Article** box-e likhun: `![chobir caption](uploads/2026/photo-ab12cd.jpg)`

### Lekha format (Article / Biography)
- Faka line = notun paragraph
- `## Heading`
- `**bold**`, `*italic*`
- `- list item`
- `> quote`
- `[link-er lekha](https://...)`

---

## Contact form theke email pete (optional, free)

GitHub Pages nije email pathate pare na, tai **Formspree** use kori:

1. **https://formspree.io** e free account khulun (apnar email diye).
2. **New Form** banan, nam din "Portfolio".
3. Form-er endpoint dekhabe `https://formspree.io/f/xyzabcde`. Shesh-er `xyzabcde` ongsho copy korun.
4. Admin panel → **Site settings → Contact & email → Formspree form ID** e paste kore **Save** korun.
5. Prothom message ashle Formspree ekta confirm email pathabe, oita confirm korun.

Formspree ID na dile form visitor-er email app khule dey, tao kaj kore.

---

## Somossa hole

| Somossa | Somadhan |
|---|---|
| "GitHub didn't accept the token" | Token bhul ba meyad shesh. Notun token banan (Dhap 2). |
| "token isn't allowed to change this repository" | Token-e **Contents: Read and write** deya hoyni, ba repository select kora hoyni. |
| "Not found on GitHub" | Username/repository nam bhul. Connect screen-e "Repository" khule thik korun. |
| Save holo kintu site-e change nai | 1–2 minute opekkha korun, tarpor Ctrl+Shift+R. Actions tab-e lal cross thakle 2 minute por abar save korun. |
| Notun chobi admin panel-e bhanga dekhay | Upload-er por 1–2 minute lage. Pore thik hoye jabe. |
| Site style chara dekhay | `assets` folder upload hoyni. Dhap 1 abar dekhun. |

---

## Folder-er bhitore ki ache (jante chaile)

- `index.html`, `research.html` ... : page-er kathamo. Lekha ashe `data` folder theke.
- `data/*.json` : apnar sob lekha. Admin panel egulo-i change kore.
- `uploads/` : admin panel diye upload kora chobi ar PDF.
- `assets/` : design (CSS), font, script, default chobi.
- `admin/` : admin panel.
