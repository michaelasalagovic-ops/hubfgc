# Projektový hub FyzioGym Cooper

Statický frontend z provozní verze. Projekty, schůzky, úkoly, účty a soubory načítá z existujícího Supabase. Repozitář obsahuje veřejný publishable klíč. Přístup k datům řídí přihlášení a pravidla Supabase.

Na GitHubu zapněte Settings → Pages → Build and deployment → Deploy from a branch. Vyberte main a / (root), poté Save. Adresu po nasazení zobrazí stejná stránka.

Před předáním týmu ověřte přihlášení správce a editora, načtení Roadmapy a otevření souboru. Správa uživatelů volá existující Edge Function. Pokud funkce vyžaduje přesný povolený původ, doplňte nový HTTPS origin GitHub Pages před testem správy účtů. Nastavení odkazů pro případné e-maily řešte v Supabase URL Configuration.

Tento export vychází z aktuální provozní verze. Lokálně připravený návrh dalšího vydání s přihlašováním pomocí uživatelského jména vyžaduje vlastní migraci a není součástí tohoto exportu.
