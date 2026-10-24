import sys, math
exec(open('/tmp/h/bil/head.py').read())
import numpy as np
def fixwind(P, I, want):
    out = []
    for t in range(0, len(I), 3):
        a, b, c = I[t], I[t+1], I[t+2]
        pa, pb, pc = [np.array(P[3*k:3*k+3]) for k in (a, b, c)]
        n = np.cross(pb-pa, pc-pa); w = want((pa+pb+pc)/3)
        out += [a, b, c] if np.dot(n, w) >= 0 else [a, c, b]
    return out
def boxPI(x0,x1,y0,y1,z0,z1):
    P=[];I=[]
    f=[[(x0,y1,z0),(x0,y1,z1),(x1,y1,z1),(x1,y1,z0)],[(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1)],
       [(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)],[(x1,y0,z0),(x0,y0,z0),(x0,y1,z0),(x1,y1,z0)],
       [(x1,y0,z1),(x1,y0,z0),(x1,y1,z0),(x1,y1,z1)],[(x0,y0,z0),(x0,y0,z1),(x0,y1,z1),(x0,y1,z0)]]
    for q in f:
        b=len(P)//3
        for v in q: P+=[round(c,4) for c in v]
        I+=[b,b+1,b+2,b,b+2,b+3]
    return P,I
def merge(parts):
    P=[];I=[]
    for p,i in parts:
        b=len(P)//3; P+=p; I+=[k+b for k in i]
    return P,I
def boxes(lst,mat):
    P,I=merge([boxPI(*b) for b in lst]); return prim(P,None,I,mat)
def disc_at(r,seg,x,y,z):
    p,i=disc(r,seg); P=[]
    for k in range(0,len(p),3): P+=[round(p[k]+x,4),round(p[k+1]+y,4),round(p[k+2]+z,4)]
    i=fixwind(P,i,lambda c:np.array([0,1,0])); return P,i
def annulus(r0,r1,seg,y):
    P=[];I=[]
    for b in range(seg+1):
        ph=2*math.pi*b/seg; c,s=math.cos(ph),math.sin(ph)
        P+=[round(r0*c,4),y,round(r0*s,4),round(r1*c,4),y,round(r1*s,4)]
    for b in range(seg):
        a=2*b; I+=[a,a+1,a+3,a,a+3,a+2]
    I=fixwind(P,I,lambda c:np.array([0,1,0])); return P,I
def frustum_x(x0,x1,r0,r1,y0,y1,seg=10):
    # tronc de cône le long de x, centre (x, y) linéaire de y0 à y1
    P=[];I=[]
    for (x,r,y) in ((x0,r0,y0),(x1,r1,y1)):
        for b in range(seg+1):
            ph=2*math.pi*b/seg
            P+=[round(x,4),round(y+r*math.cos(ph),4),round(r*math.sin(ph),4)]
    for b in range(seg):
        I+=[b,b+seg+1,b+1,b+1,b+seg+1,b+seg+2]
    cx=lambda c:c  # placeholder
    def want(c):
        t=(c[0]-x0)/(x1-x0) if x1!=x0 else 0
        yc=y0+(y1-y0)*t
        return np.array([0,c[1]-yc,c[2]])
    I=fixwind(P,I,want)
    # bouchons
    for (x,r,y,sgn) in ((x0,r0,y0,1 if x0>x1 else -1),(x1,r1,y1,1 if x1>x0 else -1)):
        b=len(P)//3; P+=[round(x,4),round(y,4),0]
        for k in range(seg+1):
            ph=2*math.pi*k/seg; P+=[round(x,4),round(y+r*math.cos(ph),4),round(r*math.sin(ph),4)]
        J=[]
        for k in range(seg): J+=[b,b+1+k,b+2+k]
        I+=fixwind(P,J,lambda c,s=sgn:np.array([s,0,0]))
    return P,I

# ---------------- matériaux
def mat(name,rgb,rough=0.6,metal=0,emis=None,alpha=None):
    m={"name":name,"pbrMetallicRoughness":{"baseColorFactor":list(rgb)+[1 if alpha is None else alpha],"metallicFactor":metal,"roughnessFactor":rough}}
    if emis: m["emissiveFactor"]=emis
    if alpha is not None: m["alphaMode"]="BLEND"
    return m
def hexrgb(h):
    h=h.lstrip('#'); return tuple(round((int(h[i:i+2],16)/255)**2.2,4) for i in (0,2,4))
materials=[]
def M(*a,**k):
    materials.append(mat(*a,**k)); return len(materials)-1
FELT=M("tex:felt",(0.03,0.30,0.17),1)
CUSH=M("tex:felt",(0.02,0.22,0.12),1)
WOOD=M("tex:wood",(0.42,0.2,0.08),0.4)
DARK=M("tex:wood",(0.16,0.08,0.04),0.65)
POCK=M("pocket",(0.005,0.005,0.005),1)
PEARL=M("pearl",(0.95,0.92,0.85),0.3,0.2)
BRASS=M("brass",(0.75,0.55,0.2),0.35,0.9)
WHITE=M("ivory",(0.97,0.95,0.9),0.12)
COLORS={1:"#f2c200",2:"#1e50c8",3:"#d62828",4:"#6a2c91",5:"#f07b1d",6:"#1a8f4a",7:"#7a1f1f",8:"#141414"}
BALLM={n:M("b%d"%n,hexrgb(c),0.1) for n,c in COLORS.items()}
TIP=M("tip",(0.12,0.3,0.7),0.9)
MAPLE=M("tex:wood",(0.85,0.66,0.42),0.35)
EBONY=M("tex:wood",(0.06,0.03,0.02),0.3)
GUIDE=M("guide",(1,1,1),0.5,0,[0.9,0.9,0.85],0.55)
AIM=M("aim",(1,0.8,0.45),0.5,0,[1,0.7,0.3],0.9)

HW,HD=4.0,2.25; T=0.6; RH=0.22
felt=mesh(boxes([(-HW,HW,-0.05,0,-HD,HD)],FELT))
rails=mesh(boxes([(-HW-T,HW+T,-0.05,RH,-HD-T,-HD-0.06),(-HW-T,HW+T,-0.05,RH,HD+0.06,HD+T),(-HW-T,-HW-0.06,-0.05,RH,-HD,HD),(HW+0.06,HW+T,-0.05,RH,-HD,HD)],WOOD))
# coussins (bandes vertes), coupés aux poches
c=0.06; ch=0.14; gapC=0.26; gapM=0.2
cush=[(-HW+gapC,-gapM,0,ch,-HD-c,-HD),(gapM,HW-gapC,0,ch,-HD-c,-HD),(-HW+gapC,-gapM,0,ch,HD,HD+c),(gapM,HW-gapC,0,ch,HD,HD+c),
      (-HW-c,-HW,0,ch,-HD+gapC,HD-gapC),(HW,HW+c,0,ch,-HD+gapC,HD-gapC)]
cushions=mesh(boxes(cush,CUSH))
base=mesh(boxes([(-HW-T-0.1,HW+T+0.1,-0.75,-0.05,-HD-T-0.1,HD+T+0.1)],DARK),boxes([(-HW-T-0.12,HW+T+0.12,-0.8,-0.72,-HD-T-0.12,HD+T+0.12)],BRASS))
legs=mesh(boxes([(sx*(HW+T-0.05)-0.2,sx*(HW+T-0.05)+0.2,-2.2,-0.75,sz*(HD+T-0.05)-0.2,sz*(HD+T-0.05)+0.2) for sx in(-1,1) for sz in(-1,1)],DARK))
# poches : disque noir sur le tapis + sur le rail
pk=[]
for (x,z,r) in [(-HW,-HD,.25),(HW,-HD,.25),(-HW,HD,.25),(HW,HD,.25),(0,-HD-0.05,.21),(0,HD+0.05,.21)]:
    pk.append(disc_at(r,16,x,0.004,z)); pk.append(disc_at(r*0.95,16,x,RH+0.003,z))
P,I=merge(pk); pockets=mesh(prim(P,None,I,POCK))
# mouches (diamants) nacrées sur les rails
dm=[]
for k in (1,2,3,5,6,7):
    x=-HW+k*HW*2/8
    dm.append(disc_at(0.04,6,x,RH+0.002,-HD-T/2)); dm.append(disc_at(0.04,6,x,RH+0.002,HD+T/2))
for k in (1,2,3):
    z=-HD+k*HD*2/4
    dm.append(disc_at(0.04,6,-HW-T/2,RH+0.002,z)); dm.append(disc_at(0.04,6,HW+T/2,RH+0.002,z))
P,I=merge(dm); sights=mesh(prim(P,None,I,PEARL))
# plateau des billes empochées, côté joueur (z+)
tray=mesh(boxes([(-2.05,2.05,-0.08,0,3.06,3.5)],WOOD),boxes([(-2.05,2.05,0,0.07,3.46,3.52),(-2.05,2.05,0,0.07,3.04,3.1),(-2.11,-2.05,0,0.07,3.04,3.52),(2.05,2.11,0,0.07,3.04,3.52),(-1.9,-1.75,-2.2,-0.08,3.2,3.35),(1.75,1.9,-2.2,-0.08,3.2,3.35)],DARK))
# billes
sp,si=sphere(18,12); si=fixwind(sp,si,lambda p:p)
_ref=prim(sp,None,si,WHITE,shared=True)
def P_(mat,idx=None):
    d={"attributes":dict(_ref["attributes"]),"indices":_ref["indices"] if idx is None else idx,"material":mat}; return d
ball_solid={n:mesh(P_(BALLM[n])) for n in range(1,9)}
cue_mesh=mesh(_ref)
ax=np.array([1,0.35,0.3]); ax/=np.linalg.norm(ax)
band=[];caps=[]
for t in range(0,len(si),3):
    tri=si[t:t+3]; cpos=np.mean([np.array(sp[3*k:3*k+3]) for k in tri],axis=0)
    (band if abs(np.dot(cpos,ax))<0.48 else caps).extend(tri)
ib=acc_idx(blob(band,'H',34963),band); ic=acc_idx(blob(caps,'H',34963),caps)
stripe={}
for n in range(9,16):
    stripe[n]=mesh(P_(BALLM[n-8],ib),P_(WHITE,ic))
# queue (le long de -x, pointe vers +x, crosse relevée) + guide pointillé (le long de +x, sur le tapis)
tilt=0.07
def qy(x): return -x*tilt  # x négatif → y positif
q=[(-0.16,-0.185,0.0105,0.011,TIP),(-0.185,-0.24,0.011,0.0115,WHITE),(-0.24,-1.15,0.0115,0.02,MAPLE),(-1.15,-1.2,0.02,0.0205,BRASS),(-1.2,-1.8,0.0205,0.028,EBONY)]
qp=[]
for (x0,x1,r0,r1,m) in q:
    P,I=frustum_x(x0,x1,r0,r1,qy(x0),qy(x1)); qp.append(prim(P,None,I,m))
dash=[]
x=0.22
while x<2.9:
    b=len([0 for _ in []]); dash.append(([x,-0.099,-0.008, x+0.08,-0.099,-0.008, x+0.08,-0.099,0.008, x,-0.099,0.008],[0,2,1,0,3,2])); x+=0.16
P,I=merge(dash); I=fixwind(P,I,lambda c:np.array([0,1,0])) if False else I
qp.append(prim(P,None,I,GUIDE))
queue=mesh(*qp)
P,I=annulus(0.085,0.12,20,-0.098); P2,I2=disc_at(0.025,12,0,-0.098,0)
tgt=mesh(prim(*merge([(P,I),(P2,I2)])[:1],None,merge([(P,I),(P2,I2)])[1],AIM))

nodes=[{"name":"felt","mesh":felt},{"name":"rails","mesh":rails},{"name":"cushions","mesh":cushions},{"name":"base","mesh":base},
       {"name":"legs","mesh":legs},{"name":"pockets","mesh":pockets},{"name":"sights","mesh":sights},{"name":"tray","mesh":tray}]
nodes.append({"name":"cue","mesh":cue_mesh,"translation":[-2,0.11,0],"scale":[0.11]*3})
for n in range(1,16):
    nodes.append({"name":"b%d"%n,"mesh":ball_solid[n] if n<=8 else stripe[n],"translation":[1.6,0.11,0],"scale":[0.11]*3})
nodes.append({"name":"queue","mesh":queue,"translation":[0,0.11,-2.55]})
nodes.append({"name":"tgt","mesh":tgt,"translation":[0,0.11,-2.55]})
kids=list(range(len(nodes)))
nodes.append({"name":"monde","rotation":[0,0.9238795,0,0.3826834],"children":kids})
ROOTN=len(nodes)-1
nodes.append({"name":"lamp","translation":[-2.0,6.5,1.5],"extensions":{"KHR_lights_punctual":{"light":0}}})
nodes.append({"name":"lamp2","translation":[2.0,6.5,1.5],"extensions":{"KHR_lights_punctual":{"light":0}}})
nodes.append({"name":"fill","translation":[0,5,-5],"extensions":{"KHR_lights_punctual":{"light":1}}})
lights=[{"type":"point","color":[1.0,0.9,0.74],"intensity":110.0},{"type":"point","color":[0.75,0.82,1.0],"intensity":60.0}]
g={"asset":{"version":"2.0"},"extensionsUsed":["KHR_lights_punctual"],"extensions":{"KHR_lights_punctual":{"lights":lights}},
 "scene":0,"scenes":[{"nodes":[ROOTN]+list(range(ROOTN+1,len(nodes)))}],"nodes":nodes,"meshes":meshes,"materials":materials,
 "buffers":[{"byteLength":len(bin_)}],"bufferViews":views,"accessors":acc}
js=json.dumps(g,separators=(',',':')).encode()
while len(js)%4: js+=b' '
while len(bin_)%4: bin_.append(0)
total=12+8+len(js)+8+len(bin_)
with open(sys.argv[1],"wb") as f:
    f.write(struct.pack('<4sII',b'glTF',2,total)); f.write(struct.pack('<I4s',len(js),b'JSON')); f.write(js)
    f.write(struct.pack('<I4s',len(bin_),b'BIN\x00')); f.write(bin_)
print(total,"octets",len(base64.b64encode(open(sys.argv[1],'rb').read())),"b64")
