import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";import { CalendarDays,Trophy,Users } from "lucide-react-native";import { FlatList,Pressable,StyleSheet,Text,View } from "react-native";import { useSafeAreaInsets } from "react-native-safe-area-context";import { getTournaments,registerTournament } from "@/lib/api";import { colors } from "@/theme";
export default function Tournaments(){
  const insets=useSafeAreaInsets();
  const qc=useQueryClient();
  const {data=[]}=useQuery({queryKey:["tournaments"],queryFn:()=>getTournaments()});
  const join=useMutation({mutationFn:(id:string)=>registerTournament(id),onSuccess:()=>void qc.invalidateQueries({queryKey:["tournaments"]})});
  return <FlatList style={s.page} contentContainerStyle={[s.content,{paddingTop:insets.top+12}]} data={data} keyExtractor={x=>x.id}
    ListHeaderComponent={<View><Text style={s.title}>Турниры</Text><Text style={s.sub}>Официальные соревнования компьютерных клубов.</Text></View>}
    ListEmptyComponent={<Text style={s.empty}>Опубликованных турниров пока нет.</Text>}
    renderItem={({item})=><View style={s.card}>
      <View style={s.row}><Trophy color={colors.primary}/><Text style={s.name}>{item.name}</Text></View>
      <Text style={s.sub}>{item.description}</Text>
      <View style={s.meta}><View style={s.row}><CalendarDays size={14} color={colors.muted}/><Text style={s.metaText}>{new Date(item.startsAt).toLocaleDateString("ru-RU")}</Text></View><View style={s.row}><Users size={14} color={colors.muted}/><Text style={s.metaText}>{item.registeredCount}/{item.capacity}</Text></View></View>
      {item.kind==="solo"&&item.status==="published"?<Pressable style={s.button} onPress={()=>join.mutate(item.id)}><Text style={s.buttonText}>Подать заявку</Text></Pressable>:null}
    </View>}/>
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:colors.background},content:{padding:18,gap:14},title:{color:colors.text,fontSize:32,fontWeight:"900"},sub:{color:colors.muted,marginTop:5,lineHeight:20},empty:{color:colors.muted,textAlign:"center",paddingTop:80},card:{padding:18,borderRadius:18,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},row:{flexDirection:"row",alignItems:"center",gap:10},name:{color:colors.text,fontSize:18,fontWeight:"800"},meta:{flexDirection:"row",justifyContent:"space-between",marginTop:16},metaText:{color:colors.muted},button:{marginTop:16,backgroundColor:colors.primary,padding:14,borderRadius:14,alignItems:"center"},buttonText:{color:colors.primaryText,fontWeight:"900"}});
