// Test the regex replacement locally
const s = 'test <div id="home-slider" class="flex">';
const firstSlideHtml = '<div class="slider-slide relative"><img src="https://firebasestorage.googleapis.com/v0/b/speed-catalogue.firebasestorage.app/o/uploads%2F17839_test.webp?alt=media&token=abc$123" /></div>';

// Old approach (broken with $ in URL)
const oldResult = s.replace(/(<div id="home-slider"[^>]*>)/, `$1\n${firstSlideHtml}`);
console.log('OLD result (broken):', oldResult.includes('slider-slide') ? 'WORKS' : 'BROKEN - no slider-slide');
console.log('OLD output snippet:', oldResult.substring(0, 200));

// New approach (fixed with function)
const newResult = s.replace(/(<div id="home-slider"[^>]*>)/, (match) => match + '\n' + firstSlideHtml);
console.log('\nNEW result:', newResult.includes('slider-slide') ? 'WORKS' : 'BROKEN');
console.log('NEW output snippet:', newResult.substring(0, 200));
