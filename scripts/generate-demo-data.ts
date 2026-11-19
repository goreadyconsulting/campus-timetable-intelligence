import { mkdirSync, writeFileSync } from "node:fs";
import { syntheticTimetable, demoProfiles, type DemoProfile } from "../data/synthetic";
const profile=process.argv[2] || "demonstration";
if(!Object.hasOwn(demoProfiles,profile)) throw new Error("Choose small, demonstration or institutional.");
const data=syntheticTimetable(profile as DemoProfile,process.argv.includes("--room-clash"));
mkdirSync(".cache",{recursive:true});
const file=".cache/cti-"+profile+".json";
writeFileSync(file,JSON.stringify(data));
console.log(JSON.stringify({file,profile,series:data.series?.length,students:data.students?.length,
  datedOccurrences:data.series?.reduce((n,s)=>n+s.teachingWeeks.length,0)},null,2));
