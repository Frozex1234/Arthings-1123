/**
 * ARTHINGS - Internationalization System
 * Supports English and Ukrainian
 */

const translations = {
    en: {
        // Navigation
        "nav.home": "Home",
        "nav.rentItems": "Rent Items",
        "nav.rentHousing": "Rent Housing",
        "nav.requests": "Requests",
        "nav.notifications": "Notifications",
        "nav.howItWorks": "How it Works",
        "nav.about": "About",
        "nav.contact": "Contact",
        "nav.map": "Map",
        "nav.login": "Log In",
        "nav.register": "Sign Up",
        "nav.profile": "Profile",
        "nav.myListings": "My Listings",
        "nav.favorites": "Favorites",
        "nav.addItem": "Add Item",
        "nav.rentalRequests": "Rental Requests",
        "nav.myRentals": "My Rentals",
        "nav.logout": "Log Out",

        // How It Works
        "howItWorks.title": "How It Works",
        "howItWorks.step1.title": "Browse Items",
        "howItWorks.step1.text": "Search for what you need in your local area",
        "howItWorks.step2.title": "Request Rental",
        "howItWorks.step2.text": "Send a rental request with your dates",
        "howItWorks.step3.title": "Pick Up & Enjoy",
        "howItWorks.step3.text": "Meet your neighbor and get what you need",

        // CTA
        "cta.ready": "Ready to join our community?",
        "cta.start": "Start sharing and renting today",
        "cta.join": "Join Now",

        // Hero
        "hero.badge": "Local Rental Community",
        "hero.title": "Share you love, love you share",
        "hero.subtitle": "Access what you need, when you need it. From emergency gear to everyday essentials, connect with your local community.",
        "hero.cta.browse": "Browse Items",
        "hero.cta.list": "List Your Item",

        // Search & Filters
        "search.placeholder": "Search for items...",
        "search.button": "Search",
        "filters.toggle": "Filters",
        "filters.category": "Category",
        "filters.all": "All Categories",
        "filters.allShort": "All",
        "filters.price": "Price Range",
        "filters.minPrice": "Min price",
        "filters.maxPrice": "Max price",
        "filters.city": "City",
        "filters.allCities": "All Cities",
        "filters.availability": "Availability",
        "filters.available": "Available only",
        "filters.sort": "Sort by",
        "filters.sort.newest": "Newest",
        "filters.sort.priceLow": "Price: Low to High",
        "filters.sort.priceHigh": "Price: High to Low",
        "filters.sort.popular": "Most Popular",
        "filters.apply": "Apply Filters",
        "filters.clear": "Clear All",
        "search.found": "{count} items found",
        "search.foundSingle": "{count} item found",
        "search.inCity": " in {city}",

        // Categories
        "category.electronics": "Electronics",
        "category.emergency": "Emergency & Survival",
        "category.tools": "Tools",
        "category.outdoor": "Outdoor & Camping",
        "category.home": "Home & Garden",
        "category.housing": "Housing",
        "category.sports": "Sports & Fitness",
        "category.other": "Other",

        // Product Card
        "product.perDay": "per day",
        "product.perWeek": "per week",
        "product.views": "views",
        "product.rentNow": "Rent Now",
        "product.edit": "Edit",
        "product.delete": "Delete",
        "product.addToFavorites": "Add to Favorites",
        "product.removeFromFavorites": "Remove from Favorites",
        "product.notAvailable": "Not Available",

        // Product Detail
        "detail.description": "Description",
        "detail.owner": "Listed by",
        "detail.contact": "Contact Owner",
        "detail.similar": "Similar Items",

        // Auth
        "auth.login.title": "Welcome Back",
        "auth.login.subtitle": "Sign in to your account",
        "auth.login.email": "Email",
        "auth.login.password": "Password",
        "auth.login.submit": "Sign In",
        "auth.login.noAccount": "Don't have an account?",
        "auth.login.register": "Sign up",
        "auth.login.forgot": "Forgot your password?",
        "auth.register.title": "Create Account",
        "auth.register.subtitle": "Join our community today",
        "auth.register.name": "Full Name",
        "auth.register.email": "Email",
        "auth.register.password": "Password",
        "auth.register.confirmPassword": "Confirm Password",
        "auth.register.phone": "Phone (optional)",
        "auth.register.city": "City",
        "auth.register.submit": "Create Account",
        "auth.register.hasAccount": "Already have an account?",
        "auth.register.login": "Sign in",

        // Add Item
        "addItem.title": "List Your Item",
        "addItem.subtitle": "Share what you have with your community",
        "addItem.name": "Item Name",
        "addItem.namePlaceholder": "e.g., Portable Generator",
        "addItem.description": "Description",
        "addItem.descriptionPlaceholder": "Describe your item in detail...",
        "addItem.category": "Category",
        "addItem.selectCategory": "Select a category",
        "addItem.price": "Price per Day (₴)",
        "addItem.city": "City",
        "addItem.selectCity": "Select your city",
        "addItem.images": "Photos",
        "addItem.uploadImages": "Upload Images",
        "addItem.dragDrop": "Drag and drop or click to upload",
        "addItem.submit": "List Item",
        "addItem.success": "Item listed successfully!",

        // Rent Flow
        "rent.title": "Rent This Item",
        "rent.startDate": "Start Date",
        "rent.endDate": "End Date",
        "rent.message": "Message to Owner (optional)",
        "rent.messagePlaceholder": "Introduce yourself and explain when you need the item...",
        "rent.summary": "Rental Summary",
        "rent.days": "days",
        "rent.total": "Total",
        "rent.submit": "Request Rental",
        "rent.success": "Rental request sent!",

        // Profile
        "profile.title": "My Profile",
        "profile.editProfile": "Edit Profile",
        "profile.saveChanges": "Save Changes",
        "profile.memberSince": "Member since",

        // My Listings
        "listings.title": "My Listings",
        "listings.empty": "You haven't listed any items yet",
        "listings.addFirst": "List your first item",

        // Favorites
        "favorites.title": "My Favorites",
        "favorites.empty": "You haven't saved any items yet",
        "favorites.browse": "Browse items",

        "rentalRequests.pageTitle": "Rental Requests - Arthings",
        "rentalRequests.title": "What people want to rent",
        "rentalRequests.subtitle": "Browse requests from people looking to rent. Have something that matches? List it and get in touch.",
        "rentalRequests.newRequest": "New request",
        "rentalRequests.empty": "No rental requests yet. Be the first to post what you need!",
        "rentalRequests.formTitle": "What do you want to rent?",
        "rentalRequests.formTitleLabel": "Title",
        "rentalRequests.formDescription": "Description",
        "rentalRequests.submit": "Submit request",
        "rentalRequests.submitSuccess": "Request published!",

        "myRentals.pageTitle": "My Rentals - Arthings",
        "myRentals.title": "My Rentals",
        "myRentals.asRenter": "As renter",
        "myRentals.asOwner": "As owner",
        "myRentals.empty": "No rentals here yet.",

        "rating.score": "Score (1–5)",
        "rating.comment": "Comment (optional)",
        "rating.submit": "Submit rating",
        "rating.rateOwner": "Rate owner",
        "rating.rateRenter": "Rate renter",
        "rating.rateUser": "Rate",
        "rating.rated": "Rated",
        "rating.review": "review",
        "rating.reviews": "reviews",
        "rating.success": "Rating submitted",

        // Footer
        "footer.description": "Connect with your community. Rent what you need, share what you have.",
        "footer.platform": "Platform",
        "footer.support": "Support",
        "footer.legal": "Legal",
        "footer.privacy": "Privacy Policy",
        "footer.terms": "Terms of Service",
        "footer.helpCenter": "Help Center",
        "footer.faq": "FAQ",
        "footer.copyright": "© 2025 Arthings. All rights reserved.",

        // Legal
        "legal.publicOffer": "Public Offer Agreement",
        "legal.privacyPolicy": "Privacy Policy",
        "legal.termsOfPerformance": "Terms of Use",
        "legal.accept": "Accept",
        "legal.agreeCheckbox": "I agree to the <a href='#' class='legal-link' data-legal='public-offer'>Public Offer</a>, <a href='#' class='legal-link' data-legal='privacy-policy'>Privacy Policy</a> and <a href='#' class='legal-link' data-legal='terms-of-performance'>Terms of Use</a>",
        "legal.rentalTerms": "By confirming the rental, you accept the <a href='#' class='legal-link' data-legal='public-offer'>public offer terms</a>",
        "legal.publishTerms": "By publishing, you agree to the <a href='#' class='legal-link' data-legal='terms-of-performance'>Terms of Use</a> and <a href='#' class='legal-link' data-legal='public-offer'>Public Offer</a>",
        "legal.cookieText": "We use cookies to improve your experience. By continuing to visit this site you agree to our use of cookies. <a href='#' class='legal-link' data-legal='privacy-policy' style='color: var(--color-primary); font-weight: 500;'>Privacy Policy</a>",
        "legal.failedToLoad": "Failed to load document.",

        // About Page
        "about.title": "About Arthings",
        "about.heroSubtitle": "Empowering communities through shared resources",
        "about.mission": "Our Mission",
        "about.missionText": "Arthings connects local communities through shared resources. We believe that sharing leads to stronger communities and more sustainable living.",
        "about.values": "Our Values",
        "about.community": "Community First",
        "about.communityText": "Building connections between neighbors",
        "about.sustainability": "Sustainability",
        "about.sustainabilityText": "Reducing waste through shared resources",
        "about.trust": "Trust & Safety",
        "about.trustText": "Verified users and secure transactions",

        // Contact Page
        "contact.title": "Contact Us",
        "contact.subtitle": "We'd love to hear from you",
        "contact.formTitle": "Send us a message",
        "contact.name": "Your Name",
        "contact.email": "Your Email",
        "contact.subject": "Subject",
        "contact.message": "Message",
        "contact.send": "Send Message",
        "contact.success": "Message sent successfully!",
        "contact.info": "Contact Information",
        "contact.address": "Kyiv, Ukraine",
        "contact.phone": "+380 (50) 123-4567",
        "contact.businessHours": "Business Hours",
        "contact.hours.weekdays": "Monday - Friday: 9:00 AM - 6:00 PM",
        "contact.hours.saturday": "Saturday: 10:00 AM - 4:00 PM",
        "contact.hours.sunday": "Sunday: Closed",
        "contact.followUs": "Follow Us",

        // Map
        "map.title": "Find Items Near You",
        "map.search": "Search location...",
        "map.results": "Items in this area",

        // Common
        "common.loading": "Loading...",
        "common.error": "Something went wrong",
        "common.retry": "Try Again",
        "common.save": "Save",
        "common.cancel": "Cancel",
        "common.confirm": "Confirm",
        "common.back": "Back",
        "common.next": "Next",
        "common.close": "Close",
        "common.noResults": "No results found",

        // Toasts
        "toast.loginSuccess": "Welcome back!",
        "toast.logoutSuccess": "Logged out successfully",
        "toast.registerSuccess": "Account created successfully!",
        "toast.itemCreated": "Item listed successfully!",
        "toast.itemUpdated": "Item updated successfully!",
        "toast.itemDeleted": "Item deleted successfully!",
        "toast.favoriteAdded": "Added to favorites!",
        "toast.favoriteRemoved": "Removed from favorites",
        "toast.rentalRequested": "Rental request sent!",
        "toast.profileUpdated": "Profile updated successfully!",
        "toast.loginRequired": "Please log in to perform this action",
        "common.unknown": "Unknown"
    },
    uk: {
        // Navigation
        "nav.home": "Головна",
        "nav.rentItems": "Оренда речей",
        "nav.rentHousing": "Оренда житла",
        "nav.requests": "Запити",
        "nav.notifications": "Сповіщення",
        "nav.howItWorks": "Як це працює",
        "nav.about": "Про нас",
        "nav.contact": "Контакти",
        "nav.map": "Карта",
        "nav.login": "Увійти",
        "nav.register": "Реєстрація",
        "nav.profile": "Профіль",
        "nav.myListings": "Мої оголошення",
        "nav.favorites": "Обране",
        "nav.addItem": "Додати річ",
        "nav.rentalRequests": "Запити на оренду",
        "nav.myRentals": "Мої оренди",
        "nav.logout": "Вийти",

        // How It Works
        "howItWorks.title": "Як це працює",
        "howItWorks.step1.title": "Переглядайте речі",
        "howItWorks.step1.text": "Знайдіть те, що вам потрібно, у вашому районі",
        "howItWorks.step2.title": "Надішліть запит",
        "howItWorks.step2.text": "Надішліть запит на оренду з бажаними датами",
        "howItWorks.step3.title": "Заберіть та користуйтесь",
        "howItWorks.step3.text": "Зустріньтесь з сусідом та отримайте річ",

        // CTA
        "cta.ready": "Готові приєднатися до нашої спільноти?",
        "cta.start": "Почніть ділитися та орендувати вже сьогодні",
        "cta.join": "Приєднатися",

        // Hero
        "hero.badge": "Локальна спільнота оренди",
        "hero.title": "Діліться з любов'ю, любіть ділитися",
        "hero.subtitle": "Отримайте те, що вам потрібно, коли вам потрібно. Від аварійного обладнання до повсякденних речей — зв'яжіться зі своєю місцевою спільнотою.",
        "hero.cta.browse": "Переглянути речі",
        "hero.cta.list": "Розмістити оголошення",

        // Search & Filters
        "search.placeholder": "Шукати речі...",
        "search.button": "Шукати",
        "filters.toggle": "Фільтри",
        "filters.category": "Категорія",
        "filters.all": "Усі категорії",
        "filters.allShort": "Всі",
        "filters.price": "Ціновий діапазон",
        "filters.minPrice": "Мін. ціна",
        "filters.maxPrice": "Макс. ціна",
        "filters.city": "Місто",
        "filters.allCities": "Усі міста",
        "filters.availability": "Наявність",
        "filters.available": "Тільки доступні",
        "filters.sort": "Сортувати за",
        "filters.sort.newest": "Найновіші",
        "filters.sort.priceLow": "Ціна: від низької до високої",
        "filters.sort.priceHigh": "Ціна: від високої до низької",
        "filters.sort.popular": "Найпопулярніші",
        "filters.apply": "Застосувати",
        "filters.clear": "Очистити все",
        "search.found": "Знайдено {count} речей",
        "search.foundSingle": "Знайдено {count} річ",
        "search.inCity": " у {city}",

        // Categories
        "category.electronics": "Електроніка",
        "category.emergency": "Надзвичайні ситуації",
        "category.tools": "Інструменти",
        "category.outdoor": "Активний відпочинок",
        "category.home": "Дім і сад",
        "category.housing": "Житло",
        "category.sports": "Спорт",
        "category.other": "Інше",

        // Product Card
        "product.perDay": "за день",
        "product.perWeek": "за тиждень",
        "product.views": "переглядів",
        "product.rentNow": "Орендувати",
        "product.edit": "Редагувати",
        "product.delete": "Видалити",
        "product.addToFavorites": "Додати до обраного",
        "product.removeFromFavorites": "Видалити з обраного",
        "product.notAvailable": "Недоступно",

        // Product Detail
        "detail.description": "Опис",
        "detail.owner": "Автор",
        "detail.contact": "Зв'язатися з власником",
        "detail.similar": "Схожі речі",

        // Auth
        "auth.login.title": "З поверненням",
        "auth.login.subtitle": "Увійдіть до свого акаунту",
        "auth.login.email": "Електронна пошта",
        "auth.login.password": "Пароль",
        "auth.login.submit": "Увійти",
        "auth.login.noAccount": "Немає акаунту?",
        "auth.login.register": "Зареєструватися",
        "auth.login.forgot": "Забули пароль?",
        "auth.register.title": "Створити акаунт",
        "auth.register.subtitle": "Приєднуйтесь до нашої спільноти",
        "auth.register.name": "Повне ім'я",
        "auth.register.email": "Електронна пошта",
        "auth.register.password": "Пароль",
        "auth.register.confirmPassword": "Підтвердіть пароль",
        "auth.register.phone": "Телефон (необов'язково)",
        "auth.register.city": "Місто",
        "auth.register.submit": "Створити акаунт",
        "auth.register.hasAccount": "Вже є акаунт?",
        "auth.register.login": "Увійти",

        // Add Item
        "addItem.title": "Розмістити річ",
        "addItem.subtitle": "Поділіться тим, що маєте, зі своєю спільнотою",
        "addItem.name": "Назва",
        "addItem.namePlaceholder": "напр., Портативний генератор",
        "addItem.description": "Опис",
        "addItem.descriptionPlaceholder": "Опишіть вашу річ детально...",
        "addItem.category": "Категорія",
        "addItem.selectCategory": "Оберіть категорію",
        "addItem.price": "Ціна за день (₴)",
        "addItem.city": "Місто",
        "addItem.selectCity": "Оберіть місто",
        "addItem.images": "Фотографії",
        "addItem.uploadImages": "Завантажити зображення",
        "addItem.dragDrop": "Перетягніть або натисніть для завантаження",
        "addItem.submit": "Розмістити",
        "addItem.success": "Річ успішно додано!",

        // Rent Flow
        "rent.title": "Орендувати цю річ",
        "rent.startDate": "Дата початку",
        "rent.endDate": "Дата закінчення",
        "rent.message": "Повідомлення власнику (необов'язково)",
        "rent.messagePlaceholder": "Представтесь та поясніть, коли вам потрібна річ...",
        "rent.summary": "Підсумок оренди",
        "rent.days": "днів",
        "rent.total": "Всього",
        "rent.submit": "Надіслати запит",
        "rent.success": "Запит на оренду надіслано!",

        // Profile
        "profile.title": "Мій профіль",
        "profile.editProfile": "Редагувати профіль",
        "profile.saveChanges": "Зберегти зміни",
        "profile.memberSince": "Учасник з",

        // My Listings
        "listings.title": "Мої оголошення",
        "listings.empty": "Ви ще не додали жодної речі",
        "listings.addFirst": "Додати першу річ",

        // Favorites
        "favorites.title": "Моє обране",
        "favorites.empty": "Ви ще не зберегли жодної речі",
        "favorites.browse": "Переглянути речі",

        "rentalRequests.pageTitle": "Запити на оренду - Arthings",
        "rentalRequests.title": "Хто що хоче орендувати",
        "rentalRequests.subtitle": "Перегляньте запити користувачів. Є щось підходяще? Додайте оголошення та зв'яжіться.",
        "rentalRequests.newRequest": "Новий запит",
        "rentalRequests.empty": "Запитів ще немає. Опублікуйте першим, що вам потрібно!",
        "rentalRequests.formTitle": "Що ви хочете орендувати?",
        "rentalRequests.formTitleLabel": "Заголовок",
        "rentalRequests.formDescription": "Опис",
        "rentalRequests.submit": "Надіслати запит",
        "rentalRequests.submitSuccess": "Запит опубліковано!",

        "myRentals.pageTitle": "Мої оренди - Arthings",
        "myRentals.title": "Мої оренди",
        "myRentals.asRenter": "Як орендар",
        "myRentals.asOwner": "Як орендодавець",
        "myRentals.empty": "Тут ще немає оренд.",

        "rating.score": "Оцінка (1–5)",
        "rating.comment": "Коментар (необов'язково)",
        "rating.submit": "Надіслати оцінку",
        "rating.rateOwner": "Оцінити орендодавця",
        "rating.rateRenter": "Оцінити орендаря",
        "rating.rateUser": "Оцінити",
        "rating.rated": "Оцінено",
        "rating.review": "відгук",
        "rating.reviews": "відгуків",
        "rating.success": "Оцінку надіслано",

        // Footer
        "footer.description": "Зв'яжіться зі своєю спільнотою. Орендуйте те, що вам потрібно, діліться тим, що маєте.",
        "footer.platform": "Платформа",

        // Legal
        "legal.publicOffer": "Договір публічної оферти",
        "legal.privacyPolicy": "Політика конфіденційності",
        "legal.termsOfPerformance": "Умови користування",
        "legal.accept": "Прийняти",
        "legal.agreeCheckbox": "Я погоджуюсь з <a href='#' class='legal-link' data-legal='public-offer'>Договором публічної оферти</a>, <a href='#' class='legal-link' data-legal='privacy-policy'>Політикою конфіденційності</a> та <a href='#' class='legal-link' data-legal='terms-of-performance'>Умовами користування</a>",
        "legal.rentalTerms": "Підтверджуючи оренду, ви приймаєте умови <a href='#' class='legal-link' data-legal='public-offer'>публічної оферти</a>",
        "legal.publishTerms": "Публікуючи, ви погоджуєтесь з <a href='#' class='legal-link' data-legal='terms-of-performance'>Умовами користування</a> та <a href='#' class='legal-link' data-legal='public-offer'>Договором оферти</a>",
        "legal.cookieText": "Ми використовуємо cookies для покращення вашого досвіду. Продовжуючи відвідувати цей сайт, ви погоджуєтесь на використання cookies. <a href='#' class='legal-link' data-legal='privacy-policy' style='color: var(--color-primary); font-weight: 500;'>Політика конфіденційності</a>",
        "legal.failedToLoad": "Не вдалося завантажити документ.",
        "footer.support": "Підтримка",
        "footer.legal": "Правова інформація",
        "footer.privacy": "Політика конфіденційності",
        "footer.terms": "Умови використання",
        "footer.helpCenter": "Центр допомоги",
        "footer.faq": "Часті питання",
        "footer.copyright": "© 2025 Arthings. Усі права захищені.",

        // About Page
        "about.title": "Про Arthings",
        "about.heroSubtitle": "Розширюємо можливості громад через спільні ресурси",
        "about.mission": "Наша місія",
        "about.missionText": "Arthings об'єднує місцеві спільноти через спільні ресурси. Ми віримо, що обмін веде до сильніших спільнот та більш сталого життя.",
        "about.values": "Наші цінності",
        "about.community": "Спільнота понад усе",
        "about.communityText": "Будуємо зв'язки між сусідами",
        "about.sustainability": "Сталий розвиток",
        "about.sustainabilityText": "Зменшуємо відходи через спільні ресурси",
        "about.trust": "Довіра та безпека",
        "about.trustText": "Перевірені користувачі та безпечні транзакції",

        // Contact Page
        "contact.title": "Зв'язатися з нами",
        "contact.subtitle": "Ми будемо раді почути від вас",
        "contact.formTitle": "Надішліть нам повідомлення",
        "contact.name": "Ваше ім'я",
        "contact.email": "Ваша пошта",
        "contact.subject": "Тема",
        "contact.message": "Повідомлення",
        "contact.send": "Надіслати",
        "contact.success": "Повідомлення успішно надіслано!",
        "contact.info": "Контактна інформація",
        "contact.address": "Київ, Україна",
        "contact.phone": "+380 (50) 123-4567",
        "contact.businessHours": "Години роботи",
        "contact.hours.weekdays": "Понеділок - П'ятниця: 9:00 - 18:00",
        "contact.hours.saturday": "Субота: 10:00 - 16:00",
        "contact.hours.sunday": "Неділя: Вихідний",
        "contact.followUs": "Слідкуйте за нами",

        // Map
        "map.title": "Знайдіть речі поблизу",
        "map.search": "Шукати місце...",
        "map.results": "Речі в цій області",

        // Common
        "common.loading": "Завантаження...",
        "common.error": "Щось пішло не так",
        "common.retry": "Спробувати ще",
        "common.save": "Зберегти",
        "common.cancel": "Скасувати",
        "common.confirm": "Підтвердити",
        "common.back": "Назад",
        "common.next": "Далі",
        "common.close": "Закрити",
        "common.noResults": "Нічого не знайдено",

        // Toasts
        "toast.loginSuccess": "З поверненням!",
        "toast.logoutSuccess": "Ви вийшли з акаунту",
        "toast.registerSuccess": "Акаунт успішно створено!",
        "toast.itemCreated": "Річ успішно додано!",
        "toast.itemUpdated": "Річ успішно оновлено!",
        "toast.itemDeleted": "Річ успішно видалено!",
        "toast.favoriteAdded": "Додано до обраного!",
        "toast.favoriteRemoved": "Видалено з обраного",
        "toast.rentalRequested": "Запит на оренду надіслано!",
        "toast.profileUpdated": "Профіль успішно оновлено!",
        "toast.loginRequired": "Будь ласка, увійдіть, щоб виконати цю дію",
        "common.unknown": "Невідомо"
    }
};

class I18n {
    constructor() {
        this.currentLang = localStorage.getItem('arthings-lang') || 'en';
        this.translations = translations;
    }

    setLanguage(lang) {
        if (this.translations[lang]) {
            this.currentLang = lang;
            localStorage.setItem('arthings-lang', lang);
            this.updatePage();
            this.updateLangSwitcher();
            window.location.reload();
        }
    }

    getLanguage() {
        return this.currentLang;
    }

    t(key) {
        return this.translations[this.currentLang][key] || this.translations['en'][key] || key;
    }

    updatePage() {
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);

            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (el.hasAttribute('placeholder')) {
                    el.placeholder = translation;
                } else {
                    el.value = translation;
                }
            } else {
                if (el.hasAttribute('data-i18n-html')) {
                    el.innerHTML = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });

        // Update elements with data-i18n-placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });

        // Update elements with data-i18n-title
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });

        // Update document title if needed
        const titleKey = document.querySelector('title[data-i18n]');
        if (titleKey) {
            document.title = this.t(titleKey.getAttribute('data-i18n'));
        }
    }

    updateLangSwitcher() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === this.currentLang);
        });
    }

    init() {
        // Set up language switcher listeners
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setLanguage(btn.dataset.lang);
            });
        });

        // Initial update
        this.updatePage();
        this.updateLangSwitcher();
    }
}

// Create global instance
const i18n = new I18n();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    i18n.init();
});

// Export for use in other modules
window.i18n = i18n;
