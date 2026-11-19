import type { AppData } from "../types";
import type { ScheduleSeries } from "../types/scheduling";
import { calendarForYear, datePlus, days } from "../lib/academic";

export const demoProfiles = {
  small: { occurrences: 500, campuses: 3, rooms: 3 },
  demonstration: { occurrences: 7500, campuses: 6, rooms: 8 },
  institutional: { occurrences: 100000, campuses: 21, rooms: 20 },
} as const;
export type DemoProfile = keyof typeof demoProfiles;

// Deliberately fictional identifiers and names. No institutional export rows
// are needed. Dated teaching always resolves from canonical series and variants.
export function syntheticTimetable(profile: DemoProfile, conflictScenario = false): AppData {
  const config = demoProfiles[profile], cal = calendarForYear();
  const stamp = "2026-09-01T00:00:00Z";
  const data: AppData = {
    schemaVersion:"5.0.0", dataRevision:1, rooms:[], lecturers:[], students:[],
    programmes:[], modules:[], studentGroups:[], sessions:[], conflicts:[],
    requirements:[], campuses:[], academicYears:[cal.year], terms:cal.terms,
    teachingWeeks:cal.weeks, templates:[], series:[], variants:[],
    allocations:[], availabilityRules:[], exceptions:[], travelRules:[],
    conflictReviews:[], publications:[], audit:[],
    publication:{version:0,status:"Draft",scope:"All campuses",notes:"",dataRevision:1},
  };
  const weeks = cal.weeks.filter(w=>w.isTeachingWeek);
  const times = ["09:00","11:00","14:00","16:00"];
  const ends = ["11:00","13:00","16:00","18:00"];
  const activityTypes = ["Workshop","Seminar","Oral Skills","Large Group"];
  const tracks: {campusId:string; campus:string; roomId:string; programmeId:string;
    moduleId:string; code:string; name:string; slot:number; staffIds:string[]; studentIds:string[];
    type:string; size:number;}[] = [];
  for(let c=0;c<config.campuses;c++){
    const prefix="SYN-"+String(c+1).padStart(2,"0");
    const online=c===config.campuses-1;
    const campus=online?"Demo Online":"Demo Campus "+String(c+1).padStart(2,"0");
    const campusId=prefix+"-C", programmeId=prefix+"-P";
    data.campuses!.push({id:campusId,code:prefix,name:campus,timeZone:"Europe/London",active:true,openingTime:"08:00",closingTime:"20:00",revision:1});
    data.programmes!.push({id:programmeId,code:"DEMO-LAW",name:"Fictional Law Programme",campus,academicYear:cal.year.name,status:"Active",revision:1});
    for(let r=0;r<config.rooms;r++){
      const key=prefix+"-R"+(r+1), roomId=key;
      const roomType=online?"Online":activityTypes[r%activityTypes.length];
      const capacity=20+(r%5)*10;
      data.rooms.push({id:roomId,room:online?"Virtual "+(r+1):"Teaching Room "+(r+1),building:"Demo Building",campus,type:roomType,capacity,status:"Available",revision:1});
      data.availabilityRules!.push({id:key+"-AV",resourceType:"Room",resourceId:roomId,timeZone:"Europe/London",days:Array.from({length:r%5===0?7:5},(_,i)=>({dayOfWeek:i+1,windows:[{start:"08:00",end:"20:00"}]})),revision:1});
      // Four distinct student cohorts per room; individual IDs, no overlapping slots.
      for(let slot=0;slot<times.length;slot++){
        const track=key+"-T"+(slot+1), code="M-"+(r+1)+"-"+(slot+1),
          moduleId=track+"-M", name=["Contract Law","Legal Skills","Business Law","Civil Practice"][slot];
        const staffIds=[track+"-L"];
        data.lecturers.push({id:staffIds[0],name:"Demo Staff "+track,department:"Teaching",modules:[code],weeklyHours:0,availability:"Mon-Sun 08:00-20:00",workload:"Normal",primaryCampus:campus,additionalCampuses:[],maxWeeklyHours:18,revision:1});
        data.modules.push({id:moduleId,code,name,course:"DEMO-LAW",campus,programmeId,lecturerId:staffIds[0],weeklySessions:1,hoursPerSession:2,roomTypeRequired:roomType,revision:1});
        const size=Math.min(capacity,10+(r*7+slot*3)%21), studentIds:string[]=[];
        for(let s=0;s<size;s++){
          const id=track+"-U"+(s+1); studentIds.push(id);
          data.students!.push({id,name:"Demo Student "+id,campus,programmeId,programme:"Fictional Law Programme",cohort:track,moduleCodes:[code],status:"Active",revision:1});
        }
        tracks.push({campusId,campus,roomId,programmeId,moduleId,code,name,slot,staffIds,studentIds,type:roomType,size});
      }
    }
  }
  let count=0, sequence=0;
  // Source profile: many one-date activity IDs plus recurring IDs with several
  // dates. Six-date patterns and three one-date activities approximate the mix.
  const dayOrder=[1,2,3,4,5,6,7];
  outer: for(let offset=0;offset<weeks.length;offset+=9){
    for(const day of dayOrder){
      for(const t of tracks){
        const roomNumber=Number(t.roomId.split("-R").at(-1));
        if(day>5 && (roomNumber-1)%5!==0)continue;
        const block=weeks.slice(offset,offset+9);
        const chunks=[block.slice(0,6),...block.slice(6).map(w=>[w])];
        for(const raw of chunks){
          const selected=raw.slice(0,config.occurrences-count);
          if(!selected.length)continue;
          const id="SYN-A"+(++sequence), weekNumbers=selected.map(w=>w.weekNumber);
          data.templates!.push({id:id+"-T",name:t.name+" · "+days[day-1],campus:t.campus,programme:"DEMO-LAW",moduleCode:t.code,moduleName:t.name,moduleId:t.moduleId,academicYearId:cal.year.id,activityType:t.type,plannedSize:t.size,durationHours:2,weeklySessions:1,teachingWeeks:weekNumbers,studentIds:t.studentIds,studentGroup:"",lecturerSuitability:"Teaching",roomSuitability:t.type,preferredDays:days[day-1].slice(0,3),preferredTime:times[t.slot],publicationRule:"Standard",status:"Scheduled",updatedAt:stamp,revision:1});
          data.series!.push({id,activityTemplateId:id+"-T",campusId:t.campusId,programmeId:t.programmeId,moduleId:t.moduleId,academicYearId:cal.year.id,dayOfWeek:day,startLocalTime:times[t.slot],endLocalTime:ends[t.slot],timeZone:"Europe/London",startDate:datePlus(selected[0].startDate,day-1),endDate:datePlus(selected.at(-1)!.startDate,day-1),teachingWeeks:weekNumbers,staffIds:t.staffIds,locationId:t.roomId,studentIds:t.studentIds,plannedSize:t.size,status:"Scheduled",createdAt:stamp,revision:1});
          count+=selected.length;
          if(count>=config.occurrences)break outer;
        }
      }
    }
  }
  if(count!==config.occurrences)throw new Error("Synthetic timetable could not reach its target.");
  const first=data.series!.find(s=>s.teachingWeeks.length>1)!;
  // A controlled change of time on one teaching week leaves the base intact.
  // Optional room clash is produced by overlapping real allocations, never by
  // inserting fabricated conflict entries.
  const partner: ScheduleSeries | undefined = conflictScenario
    ? data.series!.find(s=>s.campusId===first.campusId && s.locationId!==first.locationId &&
      s.dayOfWeek===first.dayOfWeek && s.startLocalTime===first.startLocalTime &&
      s.teachingWeeks.includes(first.teachingWeeks[0]))
    : undefined;
  data.variants!.push({id:"SYN-V1",seriesId:first.id,scope:"week_set",teachingWeeks:[first.teachingWeeks[0]],
    operation:"override",patch:partner?{locationId:partner.locationId}:{startLocalTime:"18:00",endLocalTime:"20:00"},
    reason:partner?"Demo overlapping room allocation":"Demo academic time-change request",status:"Draft",createdAt:stamp,revision:1});
  return data;
}
