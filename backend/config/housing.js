/**
 * ===========================================
 * Arthings - Housing Taxonomy
 * ===========================================
 *
 * The product brief lists twelve housing "categories", but they describe
 * three independent things:
 *
 *   property type   apartment, house, room, hostel, commercial, garage
 *   rental term     daily, monthly, short-term, long-term
 *   tenant policy   pet friendly, student housing
 *
 * Collapsing those into one enum would make ordinary combinations
 * unrepresentable — a monthly pet-friendly apartment belongs to three of them
 * at once. So the database models each axis separately and this file defines
 * the twelve browsable entries as *filter presets* over those fields.
 *
 * The UI still shows exactly twelve categories; the query underneath is
 * correct.
 */

/** @type {Array<{id:string,nameUk:string,nameEn:string,icon:string,filter:object}>} */
const HOUSING_CATEGORIES = [
    {
        id: 'apartment',
        nameUk: 'Квартира',
        nameEn: 'Apartment',
        icon: '🏢',
        filter: { housingCategory: 'apartment' }
    },
    {
        id: 'house',
        nameUk: 'Будинок',
        nameEn: 'House',
        icon: '🏡',
        filter: { housingCategory: 'house' }
    },
    {
        id: 'room',
        nameUk: 'Кімната',
        nameEn: 'Room',
        icon: '🛏️',
        filter: { housingCategory: 'room' }
    },
    {
        id: 'student',
        nameUk: 'Житло для студентів',
        nameEn: 'Student Housing',
        icon: '🎓',
        filter: { studentsAllowed: true }
    },
    {
        id: 'pet-friendly',
        nameUk: 'Можна з тваринами',
        nameEn: 'Pet Friendly',
        icon: '🐾',
        filter: { petsAllowed: true }
    },
    {
        id: 'daily',
        nameUk: 'Подобово',
        nameEn: 'Daily Rent',
        icon: '📅',
        filter: { rentalPeriod: 'daily' }
    },
    {
        id: 'monthly',
        nameUk: 'Помісячно',
        nameEn: 'Monthly Rent',
        icon: '🗓️',
        filter: { rentalPeriod: 'monthly' }
    },
    {
        id: 'long-term',
        nameUk: 'Довгостроково',
        nameEn: 'Long-term',
        icon: '⏳',
        filter: { rentalPeriod: 'long_term' }
    },
    {
        id: 'short-term',
        nameUk: 'Короткостроково',
        nameEn: 'Short-term',
        icon: '⚡',
        filter: { rentalPeriod: 'short_term' }
    },
    {
        id: 'hostel',
        nameUk: 'Хостел',
        nameEn: 'Hostel',
        icon: '🏨',
        filter: { housingCategory: 'hostel' }
    },
    {
        id: 'commercial',
        nameUk: 'Комерційна нерухомість',
        nameEn: 'Commercial Property',
        icon: '🏬',
        filter: { housingCategory: 'commercial' }
    },
    {
        id: 'garage',
        nameUk: 'Гараж',
        nameEn: 'Garage',
        icon: '🅿️',
        filter: { housingCategory: 'garage' }
    }
];

const CATEGORY_BY_ID = new Map(HOUSING_CATEGORIES.map(entry => [entry.id, entry]));

/**
 * Translates a browsable category id into a Prisma `where` fragment.
 * Unknown ids yield `{}` so a stale bookmark degrades to "show everything"
 * instead of erroring.
 *
 * @param {string} id
 * @returns {object}
 */
function categoryFilter(id) {
    return CATEGORY_BY_ID.get(id)?.filter ?? {};
}

/** Enum values, exported so validators stay in sync with the schema. */
const HOUSING_CATEGORY_VALUES = ['apartment', 'house', 'room', 'hostel', 'commercial', 'garage'];
const RENTAL_PERIOD_VALUES = ['daily', 'weekly', 'monthly', 'short_term', 'long_term'];

/** Public listing shape for the category nav. */
function publicCategories() {
    return HOUSING_CATEGORIES.map(({ id, nameUk, nameEn, icon }) => ({ id, nameUk, nameEn, icon }));
}

module.exports = {
    HOUSING_CATEGORIES,
    HOUSING_CATEGORY_VALUES,
    RENTAL_PERIOD_VALUES,
    categoryFilter,
    publicCategories
};
