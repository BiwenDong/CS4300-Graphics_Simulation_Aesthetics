@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<storage> statein: array<f32>;
@group(0) @binding(2) var<storage, read_write> stateout: array<f32>;
@group(0) @binding(3) var<uniform> params: vec4f;
// x=feed, y=kill, z=diffA, w=diffB

@group(0) @binding(4) var<uniform> mouse: vec3f;
// x,y,down

@group(0) @binding(5) var<uniform> styleMap: vec4f;
// x=feedOffTop, y=feedOffBottom, z=killOffLeft, w=killOffRight

fn index(x: i32, y: i32) -> u32 {
  let r = vec2i(res);
  let xi = ((x % r.x) + r.x) % r.x;
  let yi = ((y % r.y) + r.y) % r.y;
  return u32(yi * r.x + xi) * 2u;
}

fn getA(x:i32,y:i32)->f32{return statein[index(x,y)];}
fn getB(x:i32,y:i32)->f32{return statein[index(x,y)+1u];}

@compute @workgroup_size(8,8)
fn cs(@builtin(global_invocation_id) id:vec3u){
  let x=i32(id.x);
  let y=i32(id.y);
  let i=index(x,y);

  let a=getA(x,y);
  let b=getB(x,y);

  let lapA=0.2*(getA(x+1,y)+getA(x-1,y)+getA(x,y+1)+getA(x,y-1))
          +0.05*(getA(x+1,y+1)+getA(x-1,y+1)+getA(x+1,y-1)+getA(x-1,y-1))
          -a;

  let lapB=0.2*(getB(x+1,y)+getB(x-1,y)+getB(x,y+1)+getB(x,y-1))
          +0.05*(getB(x+1,y+1)+getB(x-1,y+1)+getB(x+1,y-1)+getB(x-1,y-1))
          -b;

  let uv = vec2f(f32(x)/res.x, f32(y)/res.y);

  // style map
  let f = params.x + mix(styleMap.x, styleMap.y, uv.y);
  let k = params.y + mix(styleMap.z, styleMap.w, uv.x);

  let Da=params.z;
  let Db=params.w;

  let reaction=a*b*b;
  let dt=1.0;

  var newA=a+(Da*lapA-reaction+f*(1.0-a))*dt;
  var newB=b+(Db*lapB+reaction-(f+k)*b)*dt;

  // 鼠标交互
  let dx=f32(x)-mouse.x;
  let dy=f32(y)-mouse.y;
  if(mouse.z>0.5 && dx*dx+dy*dy<100.0){
    newA=0.0;
    newB=1.0;
  }

  stateout[i]=clamp(newA,0.0,1.0);
  stateout[i+1u]=clamp(newB,0.0,1.0);
}