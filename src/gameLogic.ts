export const prompts: string[] = [
  "The quick brown fox jumps over the lazy dog near the riverbank as the sun sets slowly behind the mountains casting long shadows across the valley floor below.",
  "Programming is the art of telling another human what one wants the computer to do, and it requires both creativity and logical thinking to solve complex problems efficiently.",
  "A journey of a thousand miles begins with a single step, and every great achievement in history started with someone who dared to take that very first bold leap forward.",
  "The ocean waves crashed gently against the shore as children laughed and played in the warm golden sand, building castles and chasing the retreating foam with bare feet.",
  "Technology has transformed the way we communicate, learn, and work, making the world a smaller place where ideas and information flow instantly across continents and cultures.",
  "Reading books opens doors to worlds you have never visited, introducing characters who feel like old friends and ideas that challenge everything you thought you knew about life.",
  "The stars above the desert blazed with an intensity rarely seen in cities, reminding the lone traveler just how vast and ancient the universe truly is beneath it all.",
  "Patience is not the ability to wait but the ability to keep a good attitude while waiting, trusting that the right moment will come when you have done your part.",
  "Coffee shops have become modern gathering places where strangers sit close enough to share ideas, and the gentle hum of conversation mingles with the rich scent of fresh espresso.",
  "Cooking a meal from scratch is one of the most satisfying things you can do, transforming simple raw ingredients into something nourishing and delicious through skill and care.",
  "Every language holds a unique way of seeing the world, and learning a new one is not just about words but about understanding a different culture and way of thinking.",
  "The bicycle has long been celebrated as one of humanity's greatest inventions, offering a simple, efficient, and joyful way to travel that connects people directly to their environment.",
  "Mountains do not care about your ambitions or your fears, they simply stand there waiting, and it is you who must decide whether to climb or to turn back and go home.",
  "Music has the extraordinary ability to carry us back in time, evoking memories so vivid and detailed that we can almost smell, taste, and feel the moments long since passed.",
  "The library was quiet except for the soft rustle of pages turning, and in that stillness each reader existed in their own private world, lost in stories stretching across centuries.",
];

export function getRandomPrompt(): string {
  return prompts[Math.floor(Math.random() * prompts.length)];
}

/**
 * Calculate words per minute.
 * Standard WPM: each "word" = 5 characters.
 * @param charsTyped - number of characters typed
 * @param elapsedMs  - elapsed time in milliseconds
 */
export function calculateWPM(charsTyped: number, elapsedMs: number): number {
  if (elapsedMs === 0) return 0;
  return Math.round((charsTyped / 5) / (elapsedMs / 60000));
}
