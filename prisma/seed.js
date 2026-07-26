/**
 * ===========================================
 * Arthings - Database Seed Script
 * ===========================================
 * 
 * Seeds Neon Postgres database with default data
 * Run with: npm run db:seed
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seed...\n');

    // ===========================================
    // Seed Categories
    // ===========================================
    console.log('\n📦 Seeding categories...');

    const categories = [
        { id: 'electronics', name: 'Electronics', nameUk: 'Електроніка', icon: '📷' },
        { id: 'emergency', name: 'Emergency & Survival', nameUk: 'Надзвичайні ситуації', icon: '🔦' },
        { id: 'tools', name: 'Tools & Equipment', nameUk: 'Інструменти', icon: '🔧' },
        { id: 'outdoor', name: 'Outdoor & Camping', nameUk: 'Активний відпочинок', icon: '⛺' },
        { id: 'home', name: 'Home & Garden', nameUk: 'Дім і сад', icon: '🏠' },
        { id: 'housing', name: 'Housing', nameUk: 'Житло', icon: '🏢' },
        { id: 'sports', name: 'Sports & Fitness', nameUk: 'Спорт та фітнес', icon: '⚽' },
        { id: 'vehicles', name: 'Vehicles & Transport', nameUk: 'Транспорт', icon: '🚗' },
        { id: 'music', name: 'Music & Audio', nameUk: 'Музика та аудіо', icon: '🎸' },
        { id: 'party', name: 'Party & Events', nameUk: 'Свята та події', icon: '🎉' },
        { id: 'baby', name: 'Baby & Kids', nameUk: 'Дитячі товари', icon: '👶' },
        { id: 'fashion', name: 'Fashion & Accessories', nameUk: 'Мода та аксесуари', icon: '👗' },
        { id: 'other', name: 'Other', nameUk: 'Інше', icon: '📦' }
    ];

    for (const cat of categories) {
        await prisma.category.upsert({
            where: { id: cat.id },
            update: { name: cat.name, nameUk: cat.nameUk, icon: cat.icon },
            create: { id: cat.id, name: cat.name, nameUk: cat.nameUk, icon: cat.icon }
        });
    }
    console.log(`   ✓ ${categories.length} categories seeded`);

    // ===========================================
    // Seed Cities
    // ===========================================
    console.log('\n🏙️  Seeding cities...');

    const cities = [
        'Kyiv', 'Kharkiv', 'Odesa', 'Dnipro', 'Donetsk', 'Zaporizhzhia',
        'Lviv', 'Kryvyi Rih', 'Mykolaiv', 'Mariupol', 'Luhansk', 'Vinnytsia',
        'Makiivka', 'Simferopol', 'Kherson', 'Poltava', 'Chernihiv', 'Cherkasy',
        'Zhytomyr', 'Sumy', 'Rivne', 'Ivano-Frankivsk', 'Ternopil', 'Lutsk', 'Uzhhorod'
    ];

    for (const cityName of cities) {
        await prisma.city.upsert({
            where: { name: cityName },
            update: {},
            create: { name: cityName }
        });
    }
    console.log(`   ✓ ${cities.length} cities seeded`);

    // ===========================================
    // Seed Legal Documents
    // ===========================================
    console.log('\n📄 Seeding legal documents...');

    const legalDocs = [
        { type: 'public-offer', version: '1.0', file: 'PUBLIC-OFFER-AGREEMENT.docx', updatedAt: new Date() },
        { type: 'privacy-policy', version: '1.0', file: 'privacy-policy-arthings.docx', updatedAt: new Date() },
        { type: 'terms-of-performance', version: '1.0', file: 'terms-of-performance-arthings.docx', updatedAt: new Date() }
    ];

    for (const doc of legalDocs) {
        await prisma.legalDocument.upsert({
            where: { type: doc.type },
            update: { version: doc.version, file: doc.file, updatedAt: new Date(doc.updatedAt) },
            create: { type: doc.type, version: doc.version, file: doc.file, updatedAt: new Date(doc.updatedAt) }
        });
    }
    console.log(`   ✓ ${legalDocs.length} legal documents seeded`);

    // ===========================================
    // Create Default Demo User
    // ===========================================
    console.log('\n👤 Seeding demo user...');

    const demoUser = await prisma.user.upsert({
        where: { email: 'demo@arthings.com' },
        update: {},
        create: {
            email: 'demo@arthings.com',
            passwordHash: '$2a$10$rQnM7X8YxJQn6r8GQKcMXO9ZdK7ZfJnI.WBVEJqjy0yH.7PJHXPZe',
            name: 'Demo User',
            phone: '+380501234567',
            city: 'Kyiv',
            isVerified: true
        }
    });
    console.log('   ✓ Demo user created');

    console.log('\n✅ Database seeding completed successfully!\n');
}

main()
    .catch((e) => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
