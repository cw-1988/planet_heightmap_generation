// The finish's stages (finish.js STAGES) as the pages say them: Evolution's loading screen and card, and the build's
// progress card (js/build-progress.js).

export const STAGE_WORDS = { starting: 'Starting', mesh: 'Laying out the fine mesh', surface: 'Shaping the surface', climate: 'Working out the climate',
    bedrock: 'Reading the bedrock', rivers: 'Carving the rivers', sediment: 'Settling the sediment', hillslopes: 'Wearing down the hillslopes',
    'ice age': 'Carving with the last ice age', wind: 'Letting the wind work the land', sea: 'Letting in the sea', coast: 'Letting the sea work the coast', water: 'Filling the rivers and lakes',
    detail: 'Drawing the fine detail', geology: 'Mapping the rocks', 'final climate': 'Working out the climate and the land’s cover',
    deposits: 'Finding the ore deposits', farming: 'Weighing the land for farming', picture: 'Painting the picture' };

/** A stage's words, or its own name for one without. */
export const stageWords = s => STAGE_WORDS[s] ?? s;
