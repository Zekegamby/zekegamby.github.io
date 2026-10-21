import {solve} from './wrist-kinematics.js';
let config;
self.onmessage=({data})=>{
  if(data.config){config=data.config;return;}
  if(!config)return;
  try {
    let result=solve(config,data.target,data.options);
    if(!result.aligned){
      const alternate=solve(config,data.target,{...data.options,seed:config.seed});
      if(alternate.cost<result.cost)result=alternate;
    }
    self.postMessage({id:data.id,result});
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
