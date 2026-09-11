// Current mouse/touch contract and full service regression across the four required viewports.
import {RunDirectional} from './Script_DirectionalPlayTest.mjs';
await RunDirectional({profiles:process.argv.includes('--desktop')?[[1000,900,false]]:undefined});
